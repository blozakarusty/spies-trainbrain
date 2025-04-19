
import { useEffect } from "react";
import { AuthForm } from "@/components/auth/AuthForm";
import { useSearchParams } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

const Auth = () => {
  const [searchParams] = useSearchParams();
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  
  useEffect(() => {
    // Check if there's a hash with error parameters and convert to search params
    if (window.location.hash && window.location.hash.includes('error=')) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
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
  }, []);

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
