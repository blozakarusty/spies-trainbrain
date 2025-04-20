
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

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data, error } = await supabase
      .from('documents')
      .insert({
        title: file.name,
        file_path: filePath
      })
      .select('*');

    if (error) throw error;

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
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    toast({
      title: "Error Fetching Documents",
      description: error.message,
      variant: "destructive"
    });
    return [];
  }

  return data;
}

export async function processDocument(documentId: string) {
  try {
    const { data, error } = await supabase.functions.invoke('process-pdf', {
      body: { documentId }
    });

    if (error) throw error;

    toast({
      title: "Analysis Complete",
      description: "Document has been processed successfully"
    });

    return data;
  } catch (error: any) {
    toast({
      title: "Processing Failed",
      description: error.message,
      variant: "destructive"
    });
    console.error('Document Processing Error:', error);
    return null;
  }
}
