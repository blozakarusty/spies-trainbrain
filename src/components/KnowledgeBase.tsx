
import React, { useState, useEffect } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Upload } from "lucide-react";
import { uploadPDF, fetchDocuments, processDocument } from '@/utils/pdfUpload';
import { Skeleton } from "@/components/ui/skeleton";

interface Document {
  id: string;
  title: string;
  file_path: string;
  upload_date: string;
  analysis?: string;
  content?: string;
}

export const KnowledgeBase = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    setIsLoading(true);
    try {
      const docs = await fetchDocuments();
      setDocuments(docs);
    } catch (error) {
      console.error("Error loading documents:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setSelectedDoc(null);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setIsLoading(true);
      try {
        const result = await uploadPDF(file);
        if (result && result.data && Array.isArray(result.data) && result.data.length > 0) {
          const docId = result.data[0]?.id;
          if (docId) {
            await processDocument(docId);
            await loadDocuments();
          }
        }
      } catch (error) {
        console.error("Upload error:", error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const filteredDocs = documents.filter((doc) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      doc.title.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">TrainBrain</h1>
        <div className="flex gap-4">
          <Input
            type="text"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="flex-1"
          />
          <Button onClick={() => setSearchQuery('')}>Clear</Button>
          <Button 
            className="gap-2"
            variant="outline"
            asChild
          >
            <label htmlFor="pdf-upload" className="flex items-center cursor-pointer">
              <Upload className="h-4 w-4 mr-2" />
              Upload PDF
              <input 
                type="file" 
                id="pdf-upload"
                accept=".pdf"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="h-[600px]">
          <CardHeader>
            <CardTitle>Documents</CardTitle>
            <CardDescription>
              {isLoading ? "Loading..." : `${filteredDocs.length} documents found`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[480px] w-full pr-4">
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Card key={i} className="cursor-pointer transition-colors hover:bg-muted">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <Skeleton className="h-4 w-32 mb-2" />
                            <Skeleton className="h-3 w-24" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredDocs.length > 0 ? (
                    filteredDocs.map((doc) => (
                      <Card
                        key={doc.id}
                        className={`cursor-pointer transition-colors hover:bg-muted ${
                          selectedDoc?.id === doc.id ? 'border-primary' : ''
                        }`}
                        onClick={() => setSelectedDoc(doc)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3">
                            <FileText className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <h3 className="font-semibold">{doc.title}</h3>
                              <p className="text-sm text-muted-foreground">
                                {new Date(doc.upload_date).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <div className="flex items-center justify-center h-40 text-muted-foreground">
                      No documents found. Upload a PDF to get started.
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="h-[600px]">
          <CardHeader>
            <CardTitle>Document Analysis</CardTitle>
            <CardDescription>
              {selectedDoc ? selectedDoc.title : 'Select a document to view analysis'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[480px] w-full pr-4">
              {selectedDoc ? (
                <div className="space-y-6">
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">
                      Uploaded on {new Date(selectedDoc.upload_date).toLocaleDateString()}
                    </p>
                    {selectedDoc.analysis ? (
                      <p className="text-muted-foreground whitespace-pre-wrap">
                        {selectedDoc.analysis}
                      </p>
                    ) : (
                      <div className="space-y-3">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-[90%]" />
                        <Skeleton className="h-4 w-[95%]" />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Select a document to view its details
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
