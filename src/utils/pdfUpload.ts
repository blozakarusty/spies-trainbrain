
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import * as pdfjsLib from 'pdfjs-dist';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;

interface UploadResult {
  data: Array<{
    id: string;
    title: string;
    file_path: string;
    [key: string]: any;
  }> | null;
  uploadData: any;
}

// Function to extract text from PDF using PDF.js
async function extractTextFromPDF(file: File): Promise<string> {
  try {
    // Convert file to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    
    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    console.log(`PDF loaded with ${pdf.numPages} pages`);
    
    // Extract text from each page
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      
      fullText += pageText + '\n\n';
      console.log(`Page ${i} extracted, length: ${pageText.length} chars`);
    }
    
    console.log(`Total extracted text length: ${fullText.length} chars`);
    
    if (fullText.trim().length === 0) {
      console.warn("No text content was extracted from the PDF. It might be an image-based/scanned PDF.");
      return "This appears to be an image-based PDF. Text content could not be extracted automatically.";
    }
    
    return fullText;
  } catch (error) {
    console.error("Error extracting text from PDF:", error);
    return "Error extracting text content from PDF.";
  }
}

export async function uploadPDF(file: File): Promise<UploadResult | null> {
  try {
    // Extract text content from PDF first
    console.log("Extracting text content from PDF");
    const extractedText = await extractTextFromPDF(file);
    console.log(`Extracted text length: ${extractedText.length} chars`);
    
    // Prepare file for upload
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

    console.log("File uploaded successfully, inserting document record with extracted text");
    const { data, error } = await supabase
      .from('documents')
      .insert({
        title: file.name,
        file_path: filePath,
        content: extractedText, // Store the extracted text in the content field
      })
      .select('*');

    if (error) {
      console.error("Document insert error:", error);
      throw error;
    }

    toast({
      title: "Upload Successful",
      description: `${file.name} has been uploaded and text extracted (${extractedText.length} characters)`
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

export async function deleteDocument(documentId: string, filePath: string) {
  try {
    console.log(`Deleting document ${documentId} with file path ${filePath}`);
    
    // Delete from storage first
    const { error: storageError } = await supabase.storage
      .from('documents')
      .remove([filePath]);
      
    if (storageError) {
      console.error("Storage delete error:", storageError);
      throw storageError;
    }
    
    // Delete from database
    const { error: dbError } = await supabase
      .from('documents')
      .delete()
      .eq('id', documentId);
      
    if (dbError) {
      console.error("Database delete error:", dbError);
      throw dbError;
    }
    
    toast({
      title: "Document Deleted",
      description: "Document has been removed successfully"
    });
    
    return true;
  } catch (error: any) {
    console.error('Document Delete Error:', error);
    toast({
      title: "Delete Failed",
      description: error.message,
      variant: "destructive"
    });
    return false;
  }
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
      .select('id, title, file_path, content, created_at')
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
