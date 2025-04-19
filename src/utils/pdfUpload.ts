
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export async function uploadPDF(file: File, userId: string) {
  try {
    // Generate a unique filename
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}-${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    // Upload to Supabase storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    // Insert document metadata
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
