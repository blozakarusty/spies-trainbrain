import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export async function uploadPDF(file: File, userId: string) {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}-${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data, error } = await supabase
      .from('documents')
      .insert({
        title: file.name,
        file_path: filePath,
        user_id: userId
      });

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

export async function fetchUserDocuments(userId: string) {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', userId)
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
