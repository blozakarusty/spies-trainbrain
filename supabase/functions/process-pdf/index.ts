
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.5.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CHUNK_SIZE = 8000; // Smaller chunk size to prevent memory issues
const MAX_CHUNKS_PER_ANALYSIS = 5; // Limit number of chunks per analysis
const MAX_DOCUMENT_SAMPLE = 3; // Max number of documents to sample in multi-doc search

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

    // If documents array is provided, we're doing a cross-document search
    if (documents) {
      console.log("Processing cross-document search for query:", question);
      
      // Take a smaller sample of documents to prevent memory issues
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
              
              // Update document content in database (in background)
              if (docContent.length > 0) {
                const updatePromise = supabase
                  .from('documents')
                  .update({ content: docContent })
                  .eq('id', doc.id);
                  
                // Don't await this - let it run in background
                updatePromise.then(({ error }) => {
                  if (error) console.error(`Error updating document ${doc.id} content:`, error);
                  else console.log(`Updated content for document ${doc.id} in database`);
                });
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
        
        // Split content into smaller chunks to avoid memory issues
        const chunks = chunkText(docContent, CHUNK_SIZE);
        console.log(`Document ${doc.id} split into ${chunks.length} chunks`);
        
        // Only process a subset of chunks to avoid memory issues
        const chunksToProcess = chunks.slice(0, MAX_CHUNKS_PER_ANALYSIS);
        console.log(`Processing ${chunksToProcess.length} chunks from document ${doc.id}`);
        
        for (const chunk of chunksToProcess) {
          // Quickly check relevance (use smaller model)
          try {
            const relevanceCheck = await checkRelevance(chunk, question);
            if (relevanceCheck.isRelevant) {
              console.log(`Found relevant content in document ${doc.id}`);
              relevantContentChunks.push(`Document "${doc.title}":\n${relevanceCheck.excerpt}`);
              
              // Limit the number of chunks we collect to prevent memory issues
              if (relevantContentChunks.length >= 10) {
                console.log("Reached maximum relevant chunks limit, stopping collection");
                break;
              }
            }
          } catch (relevanceError) {
            console.error(`Error checking relevance for chunk in document ${doc.id}:`, relevanceError);
          }
        }
        
        // If we have enough content, stop processing more documents
        if (relevantContentChunks.length >= 10) {
          console.log("Reached maximum relevant chunks across documents, stopping document processing");
          break;
        }
      }
      
      console.log("Relevant content chunks collected:", relevantContentChunks.length);
      
      if (relevantContentChunks.length === 0) {
        console.log("No relevant content found in any document");
        return new Response(JSON.stringify({ 
          analysis: "I've analyzed the available documents, but couldn't find relevant information to answer your question." 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Combine relevant chunks but limit total size
      const combinedContent = relevantContentChunks.slice(0, 5).join('\n\n');
      console.log("Combined relevant content size:", combinedContent.length, "bytes");

      const prompt = `Based on the following relevant excerpts from documents, please analyze and answer this question: "${question}"\n\nIf you cannot find information to answer with high confidence, say so clearly. Don't make up information that isn't in the documents.\n\nRelevant excerpts:\n${combinedContent}`;

      console.log("Sending request to OpenAI with prompt size:", prompt.length, "bytes");
      const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini', // Use smaller model to prevent memory issues
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
          max_tokens: 800
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

        docContent = await fileData.text();
        console.log("Extracted text from PDF, length:", docContent.length);

        // Update document with content in background
        if (docContent.length > 0) {
          const updatePromise = supabase
            .from('documents')
            .update({ content: docContent })
            .eq('id', documentId);
            
          // Don't await this - let it run in background
          updatePromise.then(({ error }) => {
            if (error) console.error("Document update error:", error);
            else console.log("Updated document content in database");
          });
        }
      } catch (error) {
        console.error("Error extracting text from file:", error);
        throw new Error('Error processing document');
      }
    }

    // Process document content in chunks
    const chunks = chunkText(docContent, CHUNK_SIZE);
    console.log(`Document split into ${chunks.length} chunks for processing`);
    
    // Limit the number of chunks we process to prevent memory issues
    const chunksToProcess = chunks.slice(0, MAX_CHUNKS_PER_ANALYSIS);
    console.log(`Processing ${chunksToProcess.length} chunks from document`);
    
    // If there's a specific question, find relevant chunks and answer
    if (question) {
      const relevantChunks = [];
      
      for (const chunk of chunksToProcess) {
        try {
          const relevanceCheck = await checkRelevance(chunk, question);
          if (relevanceCheck.isRelevant) {
            relevantChunks.push(relevanceCheck.excerpt);
            
            // Limit number of chunks
            if (relevantChunks.length >= 5) {
              console.log("Reached maximum relevant chunks limit, stopping collection");
              break;
            }
          }
        } catch (relevanceError) {
          console.error("Error checking relevance:", relevanceError);
        }
      }
      
      console.log(`Found ${relevantChunks.length} relevant chunks for question`);
      
      let contentForAnalysis;
      if (relevantChunks.length > 0) {
        contentForAnalysis = relevantChunks.join('\n\n');
      } else {
        // If no relevant chunks found, use the first few chunks
        contentForAnalysis = chunksToProcess.map(chunk => chunk).join('\n\n');
        console.log("No specifically relevant chunks found, using document subset");
      }
      
      // Ensure content isn't too large
      if (contentForAnalysis.length > CHUNK_SIZE * 3) {
        contentForAnalysis = contentForAnalysis.substring(0, CHUNK_SIZE * 3);
        console.log("Content for analysis was too large, truncated to", contentForAnalysis.length, "bytes");
      }
      
      const prompt = `Based on the following document content, please answer this question: "${question}"\n\nDocument content: ${contentForAnalysis}`;

      console.log("Sending request to OpenAI with prompt size:", prompt.length, "bytes");
      const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini', // Use smaller model to prevent memory issues
          messages: [
            {
              role: 'system',
              content: 'You are an AI assistant that analyzes documents and answers questions about them. Provide clear, concise, and accurate responses based on the document content. If information isn't available in the document, clearly state this fact.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 800
        }),
      });

      if (!openAIResponse.ok) {
        const errorData = await openAIResponse.text();
        console.error("OpenAI API error:", errorData);
        throw new Error(`OpenAI API error: ${openAIResponse.status} ${errorData}`);
      }

      const analysisData = await openAIResponse.json();
      const analysis = analysisData.choices[0].message.content;
      console.log("Received analysis from OpenAI");

      return new Response(JSON.stringify({ analysis }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      // General analysis for document summary
      // Only use first few chunks to prevent memory issues
      const summaryChunks = chunksToProcess.slice(0, 3);
      const summaryContent = summaryChunks.join('\n\n');
      
      console.log("Generating summary with content length:", summaryContent.length, "bytes");
      
      const prompt = `Please analyze the following document content and provide a concise summary: ${summaryContent}`;

      console.log("Sending request to OpenAI for document summary");
      const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini', // Use smaller model to prevent memory issues
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
          max_tokens: 800
        }),
      });

      if (!openAIResponse.ok) {
        const errorData = await openAIResponse.text();
        console.error("OpenAI API error:", errorData);
        throw new Error(`OpenAI API error: ${openAIResponse.status} ${errorData}`);
      }

      const analysisData = await openAIResponse.json();
      const analysis = analysisData.choices[0].message.content;
      console.log("Received summary from OpenAI");

      // Store the analysis in background
      console.log("Storing analysis in database");
      const updatePromise = supabase
        .from('documents')
        .update({ analysis })
        .eq('id', documentId);
        
      // Don't await this - let it run in background
      updatePromise.then(({ error }) => {
        if (error) console.error("Error updating document analysis:", error);
        else console.log("Updated document analysis in database");
      });

      return new Response(JSON.stringify({ analysis }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('Error processing documents:', error);
    return new Response(JSON.stringify({ error: error.message }), {
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

// Function to check if a chunk is relevant to the question
async function checkRelevance(chunk, question) {
  try {
    // Use a shorter preview for relevance checking
    const previewText = chunk.length > 1500 ? chunk.substring(0, 1500) : chunk;
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',  // Using smaller model for relevance checks
        messages: [
          {
            role: 'system',
            content: 'You are an AI assistant that determines if text contains information relevant to a question. Reply with a JSON object containing "isRelevant": true or false, and if relevant, include a brief "excerpt" of the most relevant part.'
          },
          {
            role: 'user',
            content: `Question: "${question}"\n\nText to check:\n${previewText}`
          }
        ],
        max_tokens: 300,
        temperature: 0.1
      }),
    });

    if (!response.ok) {
      console.error("Error checking relevance:", await response.text());
      // Default to including the chunk if we can't check relevance
      return { isRelevant: true, excerpt: chunk.substring(0, 1000) };
    }

    const data = await response.json();
    const result = data.choices[0].message.content;
    
    try {
      // Try to parse the JSON response
      const parsed = JSON.parse(result);
      if (parsed.isRelevant) {
        return {
          isRelevant: true,
          excerpt: parsed.excerpt || chunk.substring(0, 1000)
        };
      }
      return { isRelevant: false };
    } catch (e) {
      // If parsing fails, check if the text contains "true"
      console.log("Failed to parse relevance check result:", e);
      if (result.toLowerCase().includes('"isrelevant": true') || 
          result.toLowerCase().includes('"isrelevant":true')) {
        return { isRelevant: true, excerpt: chunk.substring(0, 1000) };
      }
      return { isRelevant: false };
    }
  } catch (error) {
    console.error("Error in relevance checking:", error);
    // Default to including the chunk if the relevance check fails
    return { isRelevant: true, excerpt: chunk.substring(0, 1000) };
  }
}
