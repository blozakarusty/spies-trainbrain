
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.5.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentId, question, documents, model = 'gpt-4o', includeFullContent = false, debug = false } = await req.json();
    
    if (debug) {
      console.log("Request payload:", { 
        documentId, 
        questionLength: question?.length,
        hasDocuments: !!documents, 
        documentsCount: documents?.length,
        model,
        includeFullContent
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Cross-document search
    if (documents) {
      console.log(`Processing cross-document search for query: "${question}"`);
      console.log(`Model being used: ${model}`);
      console.log(`Full content retrieval: ${includeFullContent}`);
      
      // Process all documents we received (limited to 3 in the client)
      console.log(`Processing ${documents.length} documents`);
      
      let combinedContent = "";
      let documentMetadata = "";
      
      // Process documents to find relevant content
      for (const doc of documents) {
        console.log(`Processing document: ${doc.id} - ${doc.title}`);
        documentMetadata += `- ${doc.title}\n`;
        
        let docContent;
        
        // Download document content from storage
        try {
          console.log(`Downloading document ${doc.id} from storage`);
          const { data: fileData, error: downloadError } = await supabase
            .storage
            .from('documents')
            .download(doc.file_path);

          if (downloadError) {
            console.error(`Storage download error for document ${doc.id}:`, downloadError);
            continue;
          }

          // Extract all text content from the file
          try {
            const arrayBuffer = await fileData.arrayBuffer();
            const decoder = new TextDecoder("utf-8");
            
            try {
              // Try to decode as UTF-8
              docContent = decoder.decode(arrayBuffer);
            } catch (e) {
              console.error(`UTF-8 decoding failed for document ${doc.id}, trying as binary:`, e);
              
              // If UTF-8 fails, try to extract text in a way that preserves as much content as possible
              // This just extracts readable characters
              const bytes = new Uint8Array(arrayBuffer);
              docContent = Array.from(bytes)
                .map(byte => byte >= 32 && byte < 127 ? String.fromCharCode(byte) : ' ')
                .join('');
            }
            
            // Remove any null characters which can cause issues
            docContent = docContent.replace(/\0/g, '');
            
            // Basic cleanup - remove excessive whitespace
            docContent = docContent.replace(/\s+/g, ' ').trim();
            
            console.log(`Document ${doc.id} content extracted, size: ${docContent.length} bytes`);
            if (docContent.length < 50) {
              console.log(`Warning: Document ${doc.id} has very little content: "${docContent}"`);
            }
          } catch (textError) {
            console.error(`Error extracting text from document ${doc.id}:`, textError);
            continue;
          }
        } catch (downloadError) {
          console.error(`Error downloading document ${doc.id}:`, downloadError);
          continue;
        }
        
        if (!docContent || docContent.length === 0) {
          console.log(`No content available for document ${doc.id}`);
          continue;
        }
        
        // Increase max content size when includeFullContent is true
        const maxDocContentSize = includeFullContent ? 20000 : 10000;
        
        console.log(`Document ${doc.id} content length: ${docContent.length} bytes`);
        console.log(`Sample content: "${docContent.substring(0, 100)}..."`);
        
        // Handle large documents by taking a larger chunk instead of just the beginning
        if (docContent.length > maxDocContentSize) {
          console.log(`Document ${doc.id} is large, limiting to ${maxDocContentSize} bytes`);
          
          // Get first 70% of allowed size from start and last 30% from end to capture more context
          const startPortion = Math.floor(maxDocContentSize * 0.7);
          const endPortion = maxDocContentSize - startPortion;
          
          const startContent = docContent.substring(0, startPortion);
          const endContent = docContent.substring(docContent.length - endPortion);
          
          docContent = startContent + 
                      "\n\n[...content omitted for length...]\n\n" + 
                      endContent;
        }
        
        // Add document content to the combined content with title
        combinedContent += `\n\n### Document: "${doc.title}"\n\n${docContent}\n\n`;
      }
      
      // Enforce a reasonable limit on content size to prevent memory issues
      // Increase max combined content size when includeFullContent is true
      const maxCombinedContentSize = includeFullContent ? 40000 : 20000;
      
      if (combinedContent.length > maxCombinedContentSize) {
        console.log(`Combined content too large (${combinedContent.length} bytes), limiting to ${maxCombinedContentSize} bytes`);
        combinedContent = combinedContent.substring(0, maxCombinedContentSize);
      }
      
      console.log("Final combined content size:", combinedContent.length, "bytes");
      console.log("Documents included:", documentMetadata);

      if (combinedContent.length === 0) {
        console.log("No content available in any document");
        return new Response(JSON.stringify({ 
          analysis: "I wasn't able to find any information in the available documents to answer your question.",
          model: model
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const prompt = `
Question: "${question}"

Document Contents:
${combinedContent}

Based only on the content from these documents, provide a concise answer to the question. 
If the information isn't in the documents, clearly state this fact.
Include direct quotes or references from the documents where possible to support your answer.
`;

      console.log("Sending request to OpenAI with model:", model);
      console.log("Prompt size:", prompt.length, "bytes");
      
      try {
        const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model, // Use the specified model, defaults to gpt-4o
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
            max_tokens: 1000,
            temperature: 0.1
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
        console.log("Model used:", analysisData.model);
        console.log("First 100 chars of analysis:", analysis.substring(0, 100) + "...");

        return new Response(JSON.stringify({ analysis, model: analysisData.model }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (openAIError) {
        console.error("Error calling OpenAI API:", openAIError);
        return new Response(JSON.stringify({ 
          analysis: "I encountered an error processing your question. Please try again with a simpler query or fewer documents.",
          model: model
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Single document processing
    console.log("Processing single document with ID:", documentId);
    console.log("Model being used:", model);
    console.log("Full content retrieval:", includeFullContent);
    
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
          // Extract all text content from the file
          const arrayBuffer = await fileData.arrayBuffer();
          const decoder = new TextDecoder("utf-8");
          
          try {
            // Try to decode as UTF-8
            docContent = decoder.decode(arrayBuffer);
          } catch (e) {
            console.error(`UTF-8 decoding failed, trying as binary:`, e);
            
            // If UTF-8 fails, try to extract text in a way that preserves as much content as possible
            const bytes = new Uint8Array(arrayBuffer);
            docContent = Array.from(bytes)
              .map(byte => byte >= 32 && byte < 127 ? String.fromCharCode(byte) : ' ')
              .join('');
          }
          
          // Remove any null characters which can cause issues
          docContent = docContent.replace(/\0/g, '');
          
          // Basic cleanup - remove excessive whitespace
          docContent = docContent.replace(/\s+/g, ' ').trim();
          
          console.log("Extracted text from PDF, length:", docContent.length);
          console.log("Sample content:", docContent.substring(0, 100) + "...");
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
        analysis: "I couldn't extract any text content from this document. It might be an image-only PDF or in a format that's not supported.",
        model: model
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Increase max document size limit when includeFullContent is true
    const maxContentSize = includeFullContent ? 20000 : 10000;
    if (docContent.length > maxContentSize) {
      console.log(`Document is large, limiting to first ${maxContentSize} bytes`);
      docContent = docContent.substring(0, maxContentSize);
    }

    // Process document content
    // For specific question about a document
    if (question) {
      console.log("Question content:", question);
      
      const prompt = `
Document content:
${docContent}

Question: "${question}"

Based ONLY on the document content, please provide a concise answer to this question. 
If you cannot find the information in the document, clearly state this fact.
Include direct quotes or references from the document where possible to support your answer.
`;

      console.log("Sending request to OpenAI with model:", model);
      console.log("Prompt size:", prompt.length, "bytes");
      
      try {
        const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model,
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
            max_tokens: 1000,
            temperature: 0.1
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
        console.log("Model used:", analysisData.model);
        console.log("First 100 chars of analysis:", analysis.substring(0, 100) + "...");

        return new Response(JSON.stringify({ analysis, model: analysisData.model }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (openAIError) {
        console.error("Error calling OpenAI API:", openAIError);
        return new Response(JSON.stringify({ 
          analysis: "I encountered an error processing your question. Please try again with a simpler query.",
          model: model 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      // General analysis for document summary
      // Ensure we're only using a smaller amount of content for summary
      const summaryContent = docContent.substring(0, 8000);
      
      console.log("Generating summary with content length:", summaryContent.length, "bytes");
      
      const prompt = `
Please provide a concise summary of this document content:

${summaryContent}

Include the key topics, main points, and any important details present in the document.
`;

      console.log("Sending request to OpenAI for document summary with model:", model);
      try {
        const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model,
            messages: [
              {
                role: 'system',
                content: 'You are an AI assistant that analyzes documents and provides clear, concise summaries that capture the key information and context of the document.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            max_tokens: 1000,
            temperature: 0.1
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
        console.log("Model used:", analysisData.model);
        console.log("First 100 chars of analysis:", analysis.substring(0, 100) + "...");

        // Store the analysis in a background operation - add this in a separate try/catch
        try {
          console.log("Storing analysis in database");
          const { error: updateError } = await supabase
            .from('documents')
            .update({ analysis })
            .eq('id', documentId);
            
          if (updateError) {
            console.error("Error updating document analysis:", updateError);
          } else {
            console.log("Updated document analysis in database successfully");
          }
          
          // Also store the document content if we had to extract it
          if (!document.content && docContent) {
            console.log("Storing extracted document content in database");
            const { error: contentUpdateError } = await supabase
              .from('documents')
              .update({ content: docContent })
              .eq('id', documentId);
              
            if (contentUpdateError) {
              console.error("Error updating document content:", contentUpdateError);
            } else {
              console.log("Updated document content in database successfully");
            }
          }
        } catch (updateError) {
          console.error("Exception updating document analysis:", updateError);
        }

        return new Response(JSON.stringify({ analysis, model: analysisData.model }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (openAIError) {
        console.error("Error calling OpenAI API:", openAIError);
        return new Response(JSON.stringify({ 
          analysis: "I encountered an error processing this document. Please try again with a smaller document.",
          model: model
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
