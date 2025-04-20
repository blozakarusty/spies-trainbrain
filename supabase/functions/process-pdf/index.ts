
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.5.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CHUNK_SIZE = 100000; // Characters per chunk (100KB of text)
const MAX_TOKENS = 100000; // Maximum tokens for GPT-4o

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentId, question, documents } = await req.json();
    console.log("Request payload:", { documentId, question, hasDocuments: !!documents, documentsCount: documents?.length });

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // If documents array is provided, we're doing a cross-document search
    if (documents) {
      console.log("Processing cross-document search for query:", question);
      console.log("Number of documents to process:", documents.length);
      
      // Check if documents have content
      const documentsWithContent = documents.filter(doc => doc.content && doc.content.trim() !== '');
      console.log("Documents with content:", documentsWithContent.length);
      
      if (documentsWithContent.length === 0) {
        console.log("No documents have content, fetching from database");
        
        // Fetch content for each document
        for (const doc of documents) {
          if (!doc.content) {
            try {
              const { data: fileData, error: downloadError } = await supabase
                .storage
                .from('documents')
                .download(doc.file_path);

              if (downloadError) {
                console.error("Storage download error for document", doc.id, ":", downloadError);
                continue;
              }

              doc.content = await fileData.text();
              console.log(`Content extracted for document ${doc.id}, length: ${doc.content.length}`);
              
              // Update document with content in database
              const { error: updateError } = await supabase
                .from('documents')
                .update({ content: doc.content })
                .eq('id', doc.id);

              if (updateError) {
                console.error("Document update error:", updateError);
              }
            } catch (error) {
              console.error("Error extracting text from file:", error);
            }
          }
        }
      }
      
      // Process documents in chunks to avoid memory issues
      console.log("Processing documents in chunks");
      
      // Process the documents to create a more condensed representation with relevant information
      const relevantContentChunks = [];
      for (const doc of documents) {
        if (doc.content && doc.content.trim() !== '') {
          // Split content into manageable chunks
          const chunks = chunkText(doc.content, CHUNK_SIZE);
          console.log(`Document ${doc.id} split into ${chunks.length} chunks`);
          
          for (const chunk of chunks) {
            // Process each chunk to find relevance to question
            const relevanceCheck = await checkRelevance(chunk, question);
            
            if (relevanceCheck.isRelevant) {
              console.log(`Found relevant content in document ${doc.id}`);
              relevantContentChunks.push(`Document "${doc.title}":\n${relevanceCheck.excerpt}`);
            }
          }
        } else {
          console.log(`Document ${doc.id} has no content`);
        }
      }
      
      console.log("Number of relevant content chunks:", relevantContentChunks.length);
      
      if (relevantContentChunks.length === 0) {
        // If no relevant content was found
        console.log("No relevant content found in any document");
        return new Response(JSON.stringify({ 
          analysis: "I've analyzed all the documents, but nothing relevant could be found." 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Combine the relevant chunks but ensure we don't exceed token limits
      const combinedContent = relevantContentChunks.join('\n\n');
      console.log("Combined relevant content length:", combinedContent.length);

      const prompt = `Based on the following relevant excerpts from documents, please analyze and answer this question: "${question}"\n\nIf you cannot find information to answer with high confidence, respond with "I've analyzed all the documents, but nothing relevant could be found."\n\nRelevant excerpts:\n${combinedContent}`;

      console.log("Sending request to OpenAI with prompt length:", prompt.length);
      const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: 'You are an AI assistant that analyzes documents and provides insights based on their content. Be direct and concise in your responses. If the question is about how to do something specific with a product, try to provide step-by-step instructions if that information is available in the documents.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 1000
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

    // Get document details for single document processing
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

    // If no content is stored yet, download and extract text from PDF
    if (!document.content) {
      console.log("No content found, downloading PDF from storage");
      const { data: fileData, error: downloadError } = await supabase
        .storage
        .from('documents')
        .download(document.file_path);

      if (downloadError) {
        console.error("Storage download error:", downloadError);
        throw new Error('Error downloading PDF');
      }

      const text = await fileData.text();
      console.log("Extracted text from PDF, length:", text.length);

      // Update document with content
      const { error: updateError } = await supabase
        .from('documents')
        .update({ content: text })
        .eq('id', documentId);

      if (updateError) {
        console.error("Document update error:", updateError);
        throw new Error('Error updating document content');
      }

      document.content = text;
    }

    // For single document processing, chunk it if it's too large
    const chunks = chunkText(document.content, CHUNK_SIZE);
    console.log(`Document split into ${chunks.length} chunks for processing`);
    
    // If there's a specific question, find relevant chunks and answer
    if (question) {
      const relevantChunks = [];
      
      for (const chunk of chunks) {
        const relevanceCheck = await checkRelevance(chunk, question);
        if (relevanceCheck.isRelevant) {
          relevantChunks.push(relevanceCheck.excerpt);
        }
      }
      
      console.log(`Found ${relevantChunks.length} relevant chunks for question`);
      
      let contentForAnalysis;
      if (relevantChunks.length > 0) {
        contentForAnalysis = relevantChunks.join('\n\n');
      } else {
        // If no relevant chunks found, use a subset of the document
        contentForAnalysis = document.content.substring(0, CHUNK_SIZE * 3);
        console.log("No specifically relevant chunks found, using document subset");
      }
      
      const prompt = `Based on the following document content, please answer this question: "${question}"\n\nDocument content: ${contentForAnalysis}`;

      console.log("Sending request to OpenAI with prompt length:", prompt.length);
      const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: 'You are an AI assistant that analyzes documents and answers questions about them. Provide clear, concise, and accurate responses based on the document content. If the question is about how to do something specific with a product, provide step-by-step instructions if that information is available.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 1000
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
      // If no specific question (general analysis), process chunks and summarize
      let summaryContent = "";
      
      // Use a subset of chunks for summary to avoid memory issues
      const summaryChunks = chunks.slice(0, 5);
      summaryContent = summaryChunks.join('\n\n');
      
      console.log("Generating summary with content length:", summaryContent.length);
      
      const prompt = `Please analyze the following document content and provide a detailed summary: ${summaryContent}`;

      console.log("Sending request to OpenAI for document summary");
      const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
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
          max_tokens: 1000
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

      // Store the analysis
      console.log("Storing analysis in database");
      const { error: updateError } = await supabase
        .from('documents')
        .update({ analysis })
        .eq('id', documentId);

      if (updateError) {
        console.error("Error updating document analysis:", updateError);
        throw new Error('Error updating document analysis');
      }

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
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.substring(i, i + chunkSize));
  }
  return chunks;
}

// Function to check if a chunk is relevant to the question
async function checkRelevance(chunk, question) {
  try {
    // For longer chunks, use a smaller piece to check relevance first
    const previewText = chunk.length > 5000 ? chunk.substring(0, 5000) : chunk;
    
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
        max_tokens: 500,
        temperature: 0.2
      }),
    });

    if (!response.ok) {
      console.error("Error checking relevance:", await response.text());
      // Default to including the chunk if we can't check relevance
      return { isRelevant: true, excerpt: chunk.substring(0, 3000) };
    }

    const data = await response.json();
    const result = data.choices[0].message.content;
    
    try {
      // Try to parse the JSON response
      const parsed = JSON.parse(result);
      if (parsed.isRelevant) {
        return {
          isRelevant: true,
          excerpt: parsed.excerpt || chunk.substring(0, 3000)
        };
      }
      return { isRelevant: false };
    } catch (e) {
      // If parsing fails, check if the text contains "true"
      console.log("Failed to parse relevance check result:", e);
      if (result.toLowerCase().includes('"isrelevant": true') || 
          result.toLowerCase().includes('"isrelevant":true')) {
        return { isRelevant: true, excerpt: chunk.substring(0, 3000) };
      }
      return { isRelevant: false };
    }
  } catch (error) {
    console.error("Error in relevance checking:", error);
    // Default to including the chunk if the relevance check fails
    return { isRelevant: true, excerpt: chunk.substring(0, 3000) };
  }
}
