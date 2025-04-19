
import { useEffect, useState } from "react";
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
  const [processingAuth, setProcessingAuth] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  
  useEffect(() => {
    // Handle hash parameters and URL query parameters for auth
    const processAuthParams = async () => {
      setProcessingAuth(true);
      
      try {
        // First check URL query parameters (for Supabase direct redirects)
        const token = searchParams.get("token");
        const type = searchParams.get("type");
        
        if (token && type) {
          console.log("Found token in URL query params:", { type });
          
          if (type === "recovery") {
            // If we have a recovery token in the URL, show the reset password form
            setShowResetPassword(true);
            setProcessingAuth(false);
            return;
          }
        }
        
        // Then check hash fragments
        if (window.location.hash) {
          // Check for authentication-related hash parameters
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          
          // Check for recovery/reset password flow
          if (hashParams.has('type') && (hashParams.has('access_token') || hashParams.has('token'))) {
            const type = hashParams.get('type');
            const accessToken = hashParams.get('access_token') || hashParams.get('token');
            
            if (type === 'recovery' && accessToken) {
              console.log("Found recovery token in hash params");
              // Show reset password form for hash fragment recovery
              setShowResetPassword(true);
              setProcessingAuth(false);
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
      } catch (err: any) {
        console.error("Auth processing error:", err);
        
        // Create URL with error params for exception
        const newUrl = new URL(window.location.href);
        newUrl.hash = '';
        newUrl.searchParams.set('error', 'processing_error');
        newUrl.searchParams.set('error_description', err.message || 'There was an error processing your request.');
        window.history.replaceState({}, '', newUrl.toString());
      } finally {
        setProcessingAuth(false);
      }
    };
    
    processAuthParams();
  }, [navigate, searchParams]);

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
      
      {processingAuth ? (
        <div className="text-center">
          <p className="text-lg mb-2">Processing authentication...</p>
          <p className="text-sm text-muted-foreground">Please wait while we verify your credentials.</p>
        </div>
      ) : (
        <AuthForm showResetPassword={showResetPassword} />
      )}
    </div>
  );
};

export default Auth;
