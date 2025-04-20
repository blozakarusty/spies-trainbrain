
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
            const { data: fileData, error: downloadError } = await supabase
              .storage
              .from('documents')
              .download(doc.file_path);

            if (downloadError) {
              console.error("Storage download error for document", doc.id, ":", downloadError);
              continue;
            }

            try {
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
      
      // Prepare the document content for the prompt
      const combinedContent = documents
        .map(doc => {
          if (doc.content && doc.content.trim() !== '') {
            return `Document "${doc.title}":\n${doc.content}`;
          }
          return `Document "${doc.title}": [No content available]`;
        })
        .join('\n\n');
      
      console.log("Combined content length:", combinedContent.length);
      console.log("First 200 chars of combined content:", combinedContent.substring(0, 200));

      const prompt = `Based on the following documents, please analyze and answer this question: "${question}"\n\nIf you cannot find relevant information to answer with high confidence, respond with "I've analyzed all the documents, but nothing relevant could be found."\n\nDocuments content:\n${combinedContent}`;

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
              content: 'You are an AI assistant that analyzes documents and provides insights based on their content. Be direct and concise in your responses.'
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

    // Get document details
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

    // If there's a specific question, use it in the prompt
    const prompt = question
      ? `Based on the following document content, please answer this question: "${question}"\n\nDocument content: ${document.content}`
      : `Please analyze the following document content and provide a detailed summary: ${document.content}`;

    console.log("Sending request to OpenAI");
    // Use OpenAI to analyze the content
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
            content: 'You are an AI assistant that analyzes documents and answers questions about them. Provide clear, concise, and accurate responses based on the document content.'
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

    // If it's a general analysis (no specific question), store it
    if (!question) {
      console.log("Storing analysis in database");
      const { error: updateError } = await supabase
        .from('documents')
        .update({ analysis })
        .eq('id', documentId);

      if (updateError) {
        console.error("Error updating document analysis:", updateError);
        throw new Error('Error updating document analysis');
      }
    }

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error processing documents:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
