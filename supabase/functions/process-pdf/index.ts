
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.5.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Reduced chunk size to prevent memory issues
const CHUNK_SIZE = 3000;
const MAX_CHUNKS_PER_ANALYSIS = 2; // Reduced to 2 chunks
const MAX_DOCUMENT_SAMPLE = 2; // Reduced sample size

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentId, question, documents } = await req.json();
    console.log("Request payload:", { 
      documentId, 
      question, 
      hasDocuments: !!documents, 
      documentsCount: documents?.length 
    });

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Cross-document search
    if (documents) {
      console.log("Processing cross-document search for query:", question);
      
      // Take smaller sample of documents
      const documentSample = documents.slice(0, MAX_DOCUMENT_SAMPLE);
      console.log(`Processing ${documentSample.length} documents (sample from ${documents.length} total)`);
      
      const relevantContentChunks = [];
      
      // Process each document to find relevant content
      for (const doc of documentSample) {
        console.log(`Processing document: ${doc.id} - ${doc.title}`);
        
        let docContent = doc.content;
        
        // If document doesn't have content, download it
        if (!docContent || docContent.trim() === '') {
          try {
            console.log(`No content found for document ${doc.id}, downloading from storage`);
            const { data: fileData, error: downloadError } = await supabase
              .storage
              .from('documents')
              .download(doc.file_path);

            if (downloadError) {
              console.error(`Storage download error for document ${doc.id}:`, downloadError);
              continue;
            }

            // Get document text
            try {
              docContent = await fileData.text();
              console.log(`Downloaded content for document ${doc.id}, size: ${docContent.length} bytes`);
              
              // Update document content in database in background, but don't wait for it
              if (docContent.length > 0) {
                try {
                  // Don't use await here to avoid blocking
                  supabase
                    .from('documents')
                    .update({ content: docContent })
                    .eq('id', doc.id)
                    .then(({ error }) => {
                      if (error) console.error(`Error updating document ${doc.id} content:`, error);
                      else console.log(`Updated content for document ${doc.id} in database`);
                    });
                } catch (updateError) {
                  console.error(`Exception updating document ${doc.id} content:`, updateError);
                }
              }
            } catch (textError) {
              console.error(`Error extracting text from document ${doc.id}:`, textError);
              continue;
            }
          } catch (downloadError) {
            console.error(`Error downloading document ${doc.id}:`, downloadError);
            continue;
          }
        }
        
        if (!docContent || docContent.length === 0) {
          console.log(`No content available for document ${doc.id}`);
          continue;
        }
        
        console.log(`Document ${doc.id} content length: ${docContent.length} bytes`);
        
        // Handle very large documents by taking just the beginning
        if (docContent.length > 20000) {
          console.log(`Document ${doc.id} is very large, truncating to first 20000 bytes`);
          docContent = docContent.substring(0, 20000);
        }
        
        // Split content into smaller chunks
        const chunks = chunkText(docContent, CHUNK_SIZE);
        console.log(`Document ${doc.id} split into ${chunks.length} chunks`);
        
        // Always include the first chunk (introduction) for context
        if (chunks.length > 0) {
          console.log(`Adding first chunk from document ${doc.id} (introduction)`);
          relevantContentChunks.push(`Document "${doc.title}" (introduction):\n${chunks[0].substring(0, 1000)}`);
        }
        
        // Only process one more additional chunk to save memory
        if (chunks.length > 1) {
          console.log(`Adding second chunk from document ${doc.id}`);
          relevantContentChunks.push(`Document "${doc.title}" (continued):\n${chunks[1].substring(0, 1000)}`);
        }
        
        // If we have enough content, stop processing more documents
        if (relevantContentChunks.length >= 3) {
          console.log("Reached maximum relevant chunks across documents, stopping document processing");
          break;
        }
      }
      
      console.log("Content chunks collected:", relevantContentChunks.length);
      
      // If no relevant chunks found, but we have documents, include some content anyway
      if (relevantContentChunks.length === 0 && documentSample.length > 0) {
        console.log("No chunks found, using first parts of documents anyway");
        for (const doc of documentSample.slice(0, 1)) {
          if (doc.content && doc.content.length > 0) {
            relevantContentChunks.push(`Document "${doc.title}" (sample):\n${doc.content.substring(0, 1000)}`);
          }
        }
      }
      
      if (relevantContentChunks.length === 0) {
        console.log("No content available in any document");
        return new Response(JSON.stringify({ 
          analysis: "I wasn't able to find any information in the available documents to answer your question." 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Combine relevant chunks but strictly limit total size
      let combinedContent = relevantContentChunks.join('\n\n');
      
      // Enforce a hard limit on content size
      if (combinedContent.length > 6000) {
        console.log("Combined content too large, truncating to 6000 characters");
        combinedContent = combinedContent.substring(0, 6000);
      }
      
      console.log("Final combined content size:", combinedContent.length, "bytes");

      const prompt = `Question: "${question}"\n\nDocuments Content:\n${combinedContent}\n\nBased on ONLY the content from these documents, provide a concise answer to the question. If you cannot find sufficient information to answer with confidence, clearly state this. Do not make up information that isn't present in the documents.`;

      console.log("Sending request to OpenAI with prompt size:", prompt.length, "bytes");
      try {
        const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: 'You are a document analysis assistant that provides accurate, concise answers based strictly on the document content provided. If the information to answer a question is not available in the documents, clearly state this fact.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            max_tokens: 500,
            temperature: 0.3
          }),
        });

        if (!openAIResponse.ok) {
          const errorData = await openAIResponse.text();
          console.error("OpenAI API error:", errorData);
          throw new Error(`OpenAI API error: ${openAIResponse.status} ${errorData}`);
        }

        const analysisData = await openAIResponse.json();
        const analysis = analysisData.choices[0].message.content;
        console.log("Analysis received from OpenAI, length:", analysis.length);

        return new Response(JSON.stringify({ analysis }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (openAIError) {
        console.error("Error calling OpenAI API:", openAIError);
        return new Response(JSON.stringify({ 
          analysis: "I encountered an error processing your question. Please try again with a simpler query or fewer documents." 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Single document processing
    console.log("Processing single document with ID:", documentId);
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      console.error("Document not found:", docError);
      throw new Error('Document not found');
    }

    // Handle the case where document content is not available
    let docContent = document.content;
    if (!docContent || docContent.trim() === '') {
      console.log("No content found, downloading PDF from storage");
      try {
        const { data: fileData, error: downloadError } = await supabase
          .storage
          .from('documents')
          .download(document.file_path);

        if (downloadError) {
          console.error("Storage download error:", downloadError);
          throw new Error('Error downloading PDF');
        }

        try {
          docContent = await fileData.text();
          console.log("Extracted text from PDF, length:", docContent.length);

          // Update document with content in background - don't block
          if (docContent.length > 0) {
            try {
              // Don't use await here - fire and forget
              supabase
                .from('documents')
                .update({ content: docContent })
                .eq('id', documentId)
                .then(({ error }) => {
                  if (error) {
                    console.error("Document update error:", error);
                  } else {
                    console.log("Updated document content in database");
                  }
                });
            } catch (updateError) {
              console.error("Exception updating document content:", updateError);
            }
          }
        } catch (textError) {
          console.error("Error parsing text from file:", textError);
          docContent = ""; // Set to empty string to prevent undefined errors
        }
      } catch (error) {
        console.error("Error extracting text from file:", error);
        throw new Error('Error processing document');
      }
    }

    console.log("Document content length:", docContent ? docContent.length : 0, "bytes");
    
    // For empty documents, return an appropriate message
    if (!docContent || docContent.trim() === '') {
      console.log("Document content is empty or could not be extracted");
      return new Response(JSON.stringify({ 
        analysis: "I couldn't extract any text content from this document. It might be an image-only PDF or in a format that's not supported." 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Limit very large documents
    if (docContent.length > 20000) {
      console.log("Document is very large, truncating to first 20000 bytes");
      docContent = docContent.substring(0, 20000);
    }

    // Process document content in chunks
    const chunks = chunkText(docContent, CHUNK_SIZE);
    console.log(`Document split into ${chunks.length} chunks for processing`);
    
    // If there's a specific question, process it
    if (question) {
      console.log("Question content:", question);
      
      // For small documents, just use the content directly
      if (docContent.length < CHUNK_SIZE * 2) {
        console.log("Document is small, using entire content");
        
        const prompt = `Document content:\n${docContent}\n\nQuestion: "${question}"\n\nBased ONLY on the document content, please provide a concise answer to this question. If you cannot find the information in the document, clearly state this fact.`;

        console.log("Sending request to OpenAI with prompt size:", prompt.length, "bytes");
        try {
          const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: 'You are an AI assistant that analyzes documents and answers questions about them. Provide clear, concise, and accurate responses based only on the document content. If information is not available in the document, clearly state this fact.'
                },
                {
                  role: 'user',
                  content: prompt
                }
              ],
              max_tokens: 500,
              temperature: 0.3
            }),
          });

          if (!openAIResponse.ok) {
            const errorData = await openAIResponse.text();
            console.error("OpenAI API error:", errorData);
            throw new Error(`OpenAI API error: ${openAIResponse.status} ${errorData}`);
          }

          const analysisData = await openAIResponse.json();
          const analysis = analysisData.choices[0].message.content;
          console.log("Received analysis from OpenAI, length:", analysis.length);

          return new Response(JSON.stringify({ analysis }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } catch (openAIError) {
          console.error("Error calling OpenAI API:", openAIError);
          return new Response(JSON.stringify({ 
            analysis: "I encountered an error processing your question. Please try again with a simpler query." 
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
      
      // For larger documents, just use the first couple chunks
      const contentForAnalysis = chunks.slice(0, 2).join('\n\n');
      console.log("Using first two chunks for analysis, length:", contentForAnalysis.length);
      
      const prompt = `Document content:\n${contentForAnalysis}\n\nQuestion: "${question}"\n\nBased ONLY on the document content, please provide a concise answer to this question. If you cannot find the information in the document, clearly state this fact.`;

      console.log("Sending request to OpenAI with prompt size:", prompt.length, "bytes");
      try {
        const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: 'You are an AI assistant that analyzes documents and answers questions about them. Provide clear, concise, and accurate responses based only on the document content. If information is not available in the document, clearly state this fact.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            max_tokens: 500,
            temperature: 0.3
          }),
        });

        if (!openAIResponse.ok) {
          const errorData = await openAIResponse.text();
          console.error("OpenAI API error:", errorData);
          throw new Error(`OpenAI API error: ${openAIResponse.status} ${errorData}`);
        }

        const analysisData = await openAIResponse.json();
        const analysis = analysisData.choices[0].message.content;
        console.log("Received analysis from OpenAI, length:", analysis.length);

        return new Response(JSON.stringify({ analysis }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (openAIError) {
        console.error("Error calling OpenAI API:", openAIError);
        return new Response(JSON.stringify({ 
          analysis: "I encountered an error processing your question. Please try again with a simpler query." 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      // General analysis for document summary
      // Only use first chunk to prevent memory issues
      const summaryContent = chunks.length > 0 ? chunks[0] : "";
      
      console.log("Generating summary with content length:", summaryContent.length, "bytes");
      
      const prompt = `Please provide a concise summary of this document content:\n\n${summaryContent}`;

      console.log("Sending request to OpenAI for document summary");
      try {
        const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: 'You are an AI assistant that analyzes documents and provides clear, concise summaries.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            max_tokens: 500,
            temperature: 0.3
          }),
        });

        if (!openAIResponse.ok) {
          const errorData = await openAIResponse.text();
          console.error("OpenAI API error:", errorData);
          throw new Error(`OpenAI API error: ${openAIResponse.status} ${errorData}`);
        }

        const analysisData = await openAIResponse.json();
        const analysis = analysisData.choices[0].message.content;
        console.log("Received summary from OpenAI, length:", analysis.length);

        // Store the analysis in a background operation
        console.log("Storing analysis in database");
        try {
          // Don't await this operation
          supabase
            .from('documents')
            .update({ analysis })
            .eq('id', documentId)
            .then(({ error }) => {
              if (error) {
                console.error("Error updating document analysis:", error);
              } else {
                console.log("Updated document analysis in database successfully");
              }
            });
        } catch (updateError) {
          console.error("Exception updating document analysis:", updateError);
        }

        return new Response(JSON.stringify({ analysis }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (openAIError) {
        console.error("Error calling OpenAI API:", openAIError);
        return new Response(JSON.stringify({ 
          analysis: "I encountered an error processing this document. Please try again with a smaller document." 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
  } catch (error) {
    console.error('Error processing documents:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      analysis: "An error occurred while processing your request. Please try again with a smaller document or a simpler query."
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Function to split text into manageable chunks
function chunkText(text, chunkSize) {
  if (!text) return [];
  
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.substring(i, i + chunkSize));
  }
  return chunks;
}
