import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

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

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // If documents array is provided, we're doing a cross-document search
    if (documents) {
      const combinedContent = documents
        .map(doc => `Document "${doc.title}":\n${doc.content || ''}`)
        .join('\n\n');

      const prompt = `Based on the following documents, please analyze and answer this question: "${question}"\n\nIf you cannot find relevant information to answer with high confidence, respond with "I've analyzed all the documents, but nothing relevant could be found."\n\nDocuments content:\n${combinedContent}`;

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

      const analysisData = await openAIResponse.json();
      const analysis = analysisData.choices[0].message.content;

      return new Response(JSON.stringify({ analysis }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get document details
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      throw new Error('Document not found');
    }

    // If no content is stored yet, download and extract text from PDF
    if (!document.content) {
      const { data: fileData, error: downloadError } = await supabase
        .storage
        .from('documents')
        .download(document.file_path);

      if (downloadError) {
        throw new Error('Error downloading PDF');
      }

      const text = await fileData.text();

      // Update document with content
      const { error: updateError } = await supabase
        .from('documents')
        .update({ content: text })
        .eq('id', documentId);

      if (updateError) {
        throw new Error('Error updating document content');
      }

      document.content = text;
    }

    // If there's a specific question, use it in the prompt
    const prompt = question
      ? `Based on the following document content, please answer this question: "${question}"\n\nDocument content: ${document.content}`
      : `Please analyze the following document content and provide a detailed summary: ${document.content}`;

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

    const analysisData = await openAIResponse.json();
    const analysis = analysisData.choices[0].message.content;

    // If it's a general analysis (no specific question), store it
    if (!question) {
      const { error: updateError } = await supabase
        .from('documents')
        .update({ analysis })
        .eq('id', documentId);

      if (updateError) {
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
