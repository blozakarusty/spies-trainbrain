
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
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null);
  
  useEffect(() => {
    // Handle hash parameters and URL query parameters for auth
    const processAuthParams = async () => {
      setProcessingAuth(true);
      
      try {
        // Check for type=recovery in URL query params
        const type = searchParams.get("type");
        if (type === "recovery") {
          console.log("Found recovery type in URL params");
          setShowResetPassword(true);
          
          // Get current session - if we have one, we can reset the password
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData.session) {
            console.log("User has an active session for password reset");
          }
        }
        
        // Check for recovery tokens in URL
        const token = searchParams.get("token") || searchParams.get("access_token");
        if (token && type === "recovery") {
          console.log("Found recovery token in URL query params");
          setRecoveryToken(token);
          setShowResetPassword(true);
        }
        
        // Process hash fragments
        if (window.location.hash) {
          console.log("Processing hash fragments:", window.location.hash);
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          
          // Check for recovery flow in hash
          if (hashParams.has('type') && hashParams.get('type') === 'recovery') {
            console.log("Found recovery type in hash");
            setShowResetPassword(true);
            
            // Look for token in hash
            const hashToken = hashParams.get('access_token') || hashParams.get('token');
            if (hashToken) {
              console.log("Found recovery token in hash");
              setRecoveryToken(hashToken);
            }
          }
          
          // Process general auth
          if (hashParams.has('access_token') || hashParams.has('refresh_token')) {
            console.log("Found auth tokens in hash, letting Supabase handle them");
            
            // Let Supabase process the tokens
            const { data, error } = await supabase.auth.getSession();
            
            if (error) {
              console.error("Error processing hash tokens:", error);
              throw error;
            }
            
            if (data.session) {
              console.log("Successfully processed tokens from hash");
            }
          }
          
          // Handle error in hash
          if (hashParams.has('error')) {
            console.error("Error in hash:", hashParams.get('error'), hashParams.get('error_description'));
            
            // Move hash params to search params for better display
            const newUrl = new URL(window.location.href);
            newUrl.hash = '';
            
            for (const [key, value] of hashParams.entries()) {
              newUrl.searchParams.append(key, value);
            }
            
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
        <AuthForm showResetPassword={showResetPassword} recoveryToken={recoveryToken} />
      )}
    </div>
  );
};

export default Auth;
