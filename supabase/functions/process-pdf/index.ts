
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
    const { documentId, question, documents, model = 'gpt-4o' } = await req.json();
    console.log("Request payload:", { 
      documentId, 
      question, 
      hasDocuments: !!documents, 
      documentsCount: documents?.length,
      model
    });

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Cross-document search
    if (documents) {
      console.log("Processing cross-document search for query:", question);
      
      // Process all documents we received (limited to 3 in the client)
      console.log(`Processing ${documents.length} documents`);
      
      let combinedContent = "";
      
      // Process documents to find relevant content
      for (const doc of documents) {
        console.log(`Processing document: ${doc.id} - ${doc.title}`);
        
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

          // Get document text
          try {
            docContent = await fileData.text();
            console.log(`Downloaded content for document ${doc.id}, size: ${docContent.length} bytes`);
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
        
        console.log(`Document ${doc.id} content length: ${docContent.length} bytes`);
        
        // Handle large documents by taking just the beginning
        if (docContent.length > 5000) {
          console.log(`Document ${doc.id} is large, truncating to first 5000 bytes`);
          docContent = docContent.substring(0, 5000);
        }
        
        // Add document content to the combined content with title
        combinedContent += `Document "${doc.title}":\n${docContent}\n\n`;
      }
      
      // Enforce a reasonable limit on content size to prevent memory issues
      const maxContentSize = 10000;
      if (combinedContent.length > maxContentSize) {
        console.log(`Combined content too large (${combinedContent.length} bytes), truncating to ${maxContentSize} bytes`);
        combinedContent = combinedContent.substring(0, maxContentSize);
      }
      
      console.log("Final combined content size:", combinedContent.length, "bytes");

      if (combinedContent.length === 0) {
        console.log("No content available in any document");
        return new Response(JSON.stringify({ 
          analysis: "I wasn't able to find any information in the available documents to answer your question." 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const prompt = `Question: "${question}"\n\nDocuments Content:\n${combinedContent}\n\nBased only on the content from these documents, provide a concise answer to the question. If the information isn't in the documents, clearly state this fact.`;

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

        return new Response(JSON.stringify({ analysis, model: analysisData.model }), {
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

    // Limit document size to prevent memory issues
    const maxContentSize = 10000;
    if (docContent.length > maxContentSize) {
      console.log(`Document is large, truncating to first ${maxContentSize} bytes`);
      docContent = docContent.substring(0, maxContentSize);
    }

    // Process document content
    // For specific question about a document
    if (question) {
      console.log("Question content:", question);
      
      const prompt = `Document content:\n${docContent}\n\nQuestion: "${question}"\n\nBased ONLY on the document content, please provide a concise answer to this question. If you cannot find the information in the document, clearly state this fact.`;

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

        return new Response(JSON.stringify({ analysis, model: analysisData.model }), {
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
      // Ensure we're only using a smaller amount of content for summary
      const summaryContent = docContent.substring(0, 5000);
      
      console.log("Generating summary with content length:", summaryContent.length, "bytes");
      
      const prompt = `Please provide a concise summary of this document content:\n\n${summaryContent}`;

      console.log("Sending request to OpenAI for document summary with model:", model);
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
                content: 'You are an AI assistant that analyzes documents and provides clear, concise summaries.'
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
        } catch (updateError) {
          console.error("Exception updating document analysis:", updateError);
        }

        return new Response(JSON.stringify({ analysis, model: analysisData.model }), {
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
