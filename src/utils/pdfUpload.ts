
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface UploadResult {
  data: Array<{
    id: string;
    title: string;
    file_path: string;
    [key: string]: any;
  }> | null;
  uploadData: any;
}

export async function uploadPDF(file: File): Promise<UploadResult | null> {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    console.log("Uploading file to storage:", filePath);
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file);

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      throw uploadError;
    }

    console.log("File uploaded successfully, inserting document record");
    const { data, error } = await supabase
      .from('documents')
      .insert({
        title: file.name,
        file_path: filePath,
      })
      .select('*');

    if (error) {
      console.error("Document insert error:", error);
      throw error;
    }

    toast({
      title: "Upload Successful",
      description: `${file.name} has been uploaded`
    });

    return { uploadData, data };
  } catch (error: any) {
    toast({
      title: "Upload Failed",
      description: error.message,
      variant: "destructive"
    });
    console.error('PDF Upload Error:', error);
    return null;
  }
}

export async function fetchDocuments() {
  console.log("Fetching documents from database");
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Document fetch error:", error);
    toast({
      title: "Error Fetching Documents",
      description: error.message,
      variant: "destructive"
    });
    return [];
  }

  console.log("Documents fetched:", data ? data.length : 0);
  return data;
}

export async function processDocument(documentId: string, question?: string) {
  try {
    console.log(`Processing document ${documentId}${question ? ' with question' : ''}`);
    
    // Set a longer timeout for function call to allow for processing
    const timeoutMs = 30000; // 30 seconds timeout
    
    // Create a promise that rejects after timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error("Processing timed out after 30 seconds"));
      }, timeoutMs);
    });
    
    // Actual function call with minimal payload
    const functionPromise = supabase.functions.invoke('process-pdf', {
      body: { 
        documentId, 
        question,
        model: "gpt-4o", // Explicitly specify the model to ensure GPT-4o is used
        includeFullContent: true // Flag to request full document content
      }
    });
    
    // Use Promise.race to implement timeout
    const result = await Promise.race([functionPromise, timeoutPromise]);
    
    // @ts-ignore - TypeScript doesn't know that result is from functionPromise
    const { data, error } = result;

    if (error) {
      console.error("Process PDF function error:", error);
      throw error;
    }

    if (!question) {
      toast({
        title: "Analysis Complete",
        description: "Document has been processed successfully"
      });
    }

    return data;
  } catch (error: any) {
    console.error('Document Processing Error:', error);
    toast({
      title: "Processing Failed",
      description: error.message || "Document processing failed. Please try again with a smaller document.",
      variant: "destructive"
    });
    return null;
  }
}

export async function queryAllDocuments(question: string) {
  try {
    console.log("Querying across all documents with question:", question);
    // Set a longer timeout
    const timeoutMs = 30000; // 30 seconds timeout
    
    // Create a promise that rejects after timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error("Query timed out after 30 seconds"));
      }, timeoutMs);
    });
    
    // Get document metadata to prepare for query
    const { data: documents, error: fetchError } = await supabase
      .from('documents')
      .select('id, title, file_path, created_at')
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error("Error fetching documents:", fetchError);
      throw fetchError;
    }

    console.log(`Found ${documents.length} documents to search through`);
    
    // Only send a limited number of documents to prevent memory issues
    const limitedDocuments = documents.slice(0, 3); // Limit to 3 most recent documents
    
    // Create actual function call with the documents
    const functionPromise = supabase.functions.invoke('process-pdf', {
      body: { 
        question, 
        documents: limitedDocuments,
        model: "gpt-4o", // Explicitly set the model to gpt-4o
        includeFullContent: true, // Flag to request full document content
        debug: true // Enable debug mode for detailed processing logs
      }
    });
    
    // Use Promise.race to implement timeout
    const result = await Promise.race([functionPromise, timeoutPromise]);
    
    // @ts-ignore - TypeScript doesn't know that result is from functionPromise
    const { data, error } = result;

    if (error) {
      console.error("Process PDF function error:", error);
      throw error;
    }

    return data;
  } catch (error: any) {
    console.error('Document Query Error:', error);
    toast({
      title: "Query Failed",
      description: error.message || "Query processing failed. Please try with a simpler question.",
      variant: "destructive"
    });
    return null;
  }
}
