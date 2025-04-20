
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
        // No longer adding a user_id field as it's now nullable
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
    
    // Add a timeout for the function call
    const timeoutMs = 25000; // 25 seconds
    
    // Create a promise that rejects after timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error("Processing timed out after 25 seconds"));
      }, timeoutMs);
    });
    
    // Actual function call
    const functionPromise = supabase.functions.invoke('process-pdf', {
      body: { documentId, question }
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
      description: error.message || "Document was too large to process",
      variant: "destructive"
    });
    return null;
  }
}

export async function queryAllDocuments(question: string) {
  try {
    console.log("Querying across all documents");
    // Set a timeout for the query to prevent hanging on long operations
    const timeoutMs = 25000; // 25 seconds
    
    // Create a promise that rejects after timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error("Query timed out after 25 seconds"));
      }, timeoutMs);
    });
    
    // Get limited document metadata to reduce payload size
    const { data: documents, error: fetchError } = await supabase
      .from('documents')
      .select('id, title, file_path, created_at')
      .order('created_at', { ascending: false })
      .limit(5); // Limit to 5 most recent documents to reduce payload size

    if (fetchError) {
      console.error("Error fetching documents:", fetchError);
      throw fetchError;
    }

    console.log(`Found ${documents.length} documents to search through`);
    
    // Create actual function call
    const functionPromise = supabase.functions.invoke('process-pdf', {
      body: { question, documents }
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
      description: error.message || "Documents were too large to process",
      variant: "destructive"
    });
    return null;
  }
}
