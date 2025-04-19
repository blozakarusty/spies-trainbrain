
import { useEffect } from "react";
import { AuthForm } from "@/components/auth/AuthForm";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const Auth = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  
  useEffect(() => {
    // Handle hash parameters (recovery, access_token, etc.)
    if (window.location.hash) {
      // Check for authentication-related hash parameters
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      
      // Check for recovery/reset password flow
      if (hashParams.has('type') && hashParams.has('access_token')) {
        const type = hashParams.get('type');
        const accessToken = hashParams.get('access_token');
        
        if (type === 'recovery' && accessToken) {
          // Handle password recovery - automatically process the token
          handleRecoveryToken(accessToken);
          return;
        }
      }
      
      // Handle general error parameters in hash
      if (hashParams.has('error')) {
        // Create a new URL with search params instead of hash
        const newUrl = new URL(window.location.href);
        newUrl.hash = '';
        
        // Add all hash params to search params
        for (const [key, value] of hashParams.entries()) {
          newUrl.searchParams.append(key, value);
        }
        
        // Replace the current URL without reloading the page
        window.history.replaceState({}, '', newUrl.toString());
      }
    }
  }, [navigate]);
  
  // Function to handle recovery tokens
  const handleRecoveryToken = async (token: string) => {
    try {
      // Process the recovery token
      const { error } = await supabase.auth.refreshSession({
        refresh_token: token,
      });
      
      if (error) {
        console.error("Error processing recovery token:", error);
        // Create URL with error params
        const newUrl = new URL(window.location.href);
        newUrl.hash = '';
        newUrl.searchParams.append('error', 'invalid_recovery');
        newUrl.searchParams.append('error_description', 'The recovery link is invalid or has expired.');
        window.history.replaceState({}, '', newUrl.toString());
      } else {
        // Successfully processed the token, redirect to password reset form or home
        navigate('/');
      }
    } catch (err) {
      console.error("Exception processing recovery token:", err);
      // Create URL with error params for exception
      const newUrl = new URL(window.location.href);
      newUrl.hash = '';
      newUrl.searchParams.append('error', 'processing_error');
      newUrl.searchParams.append('error_description', 'There was an error processing your request.');
      window.history.replaceState({}, '', newUrl.toString());
    }
  };

  return (
    <div className="container flex flex-col items-center justify-center min-h-screen py-8">
      {error && (
        <Alert variant="destructive" className="mb-6 max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Authentication Error</AlertTitle>
          <AlertDescription>
            {errorDescription || "There was an error with the authentication process. Please try again."}
          </AlertDescription>
        </Alert>
      )}
      <AuthForm />
    </div>
  );
};

export default Auth;
