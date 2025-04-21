
import React, { useState, useEffect } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Upload, Send, Trash2, RefreshCw } from "lucide-react";
import { uploadPDF, fetchDocuments, processDocument, queryAllDocuments, deleteDocument } from '@/utils/pdfUpload';
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Document {
  id: string;
  title: string;
  file_path: string;
  upload_date: string;
  content?: string;
  analysis?: string;
}

export const KnowledgeBase = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [answerModel, setAnswerModel] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [globalQuestion, setGlobalQuestion] = useState('');
  const [globalAnswer, setGlobalAnswer] = useState('');
  const [globalAnswerModel, setGlobalAnswerModel] = useState('');
  const [isSearchingAll, setIsSearchingAll] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<Document | null>(null);

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

  const handleDeleteDocument = async (document: Document) => {
    setIsDeleting(true);
    try {
      const success = await deleteDocument(document.id, document.file_path);
      if (success) {
        // If the deleted document was selected, clear selection
        if (selectedDoc && selectedDoc.id === document.id) {
          setSelectedDoc(null);
          setAnswer('');
          setAnswerModel('');
        }
        // Refresh document list
        await loadDocuments();
      }
    } catch (error) {
      console.error("Error deleting document:", error);
    } finally {
      setIsDeleting(false);
      setDocumentToDelete(null);
    }
  };

  const handleAskQuestion = async () => {
    if (!selectedDoc || !question.trim()) return;

    setIsAnalyzing(true);
    setAnswer('');
    setAnswerModel('');
    try {
      const response = await processDocument(selectedDoc.id, question);
      if (response) {
        setAnswer(response.analysis);
        setAnswerModel(response.model || 'gpt-4o');
      }
    } catch (error) {
      console.error("Error asking question:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGlobalQuestion = async () => {
    if (!globalQuestion.trim()) return;

    setIsSearchingAll(true);
    setGlobalAnswer('');
    setGlobalAnswerModel('');
    try {
      const response = await queryAllDocuments(globalQuestion);
      if (response) {
        setGlobalAnswer(response.analysis);
        setGlobalAnswerModel(response.model || 'gpt-4o');
      }
    } catch (error) {
      console.error("Error asking global question:", error);
    } finally {
      setIsSearchingAll(false);
    }
  };

  const filteredDocs = documents.filter((doc) => {
    const searchLower = searchQuery.toLowerCase();
    return doc.title.toLowerCase().includes(searchLower);
  });

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold">TrainBrain</h1>
          <Button 
            variant="outline"
            size="sm"
            onClick={loadDocuments}
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
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

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Ask Across All Documents</CardTitle>
            <CardDescription>
              Ask a question that will be searched across all uploaded documents
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Textarea
                placeholder="What would you like to know about the uploaded documents?"
                value={globalQuestion}
                onChange={(e) => setGlobalQuestion(e.target.value)}
              />
              <Button 
                onClick={handleGlobalQuestion}
                disabled={isSearchingAll || !globalQuestion.trim()}
                className="w-full"
              >
                {isSearchingAll ? (
                  "Searching All Documents..."
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Search All Documents
                  </>
                )}
              </Button>
              {globalAnswer && (
                <div className="bg-muted p-4 rounded-lg mt-4">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="font-semibold">Analysis Result</h4>
                    {globalAnswerModel && (
                      <Badge variant="outline" className="text-xs">
                        Model: {globalAnswerModel}
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {globalAnswer}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
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
                        className={`transition-colors hover:bg-muted ${
                          selectedDoc?.id === doc.id ? 'border-primary' : ''
                        }`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div 
                              className="flex items-center gap-3 cursor-pointer flex-1"
                              onClick={() => {
                                setSelectedDoc(doc);
                                setAnswer('');
                                setAnswerModel('');
                              }}
                            >
                              <FileText className="h-5 w-5 text-muted-foreground" />
                              <div>
                                <h3 className="font-semibold">{doc.title}</h3>
                                <p className="text-sm text-muted-foreground">
                                  {new Date(doc.upload_date).toLocaleDateString()}
                                </p>
                                {doc.content && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {doc.content.length} characters extracted
                                  </p>
                                )}
                              </div>
                            </div>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDocumentToDelete(doc);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  <span className="sr-only">Delete</span>
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Document</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete "{doc.title}"? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-red-500 hover:bg-red-600"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      handleDeleteDocument(doc);
                                    }}
                                    disabled={isDeleting}
                                  >
                                    {isDeleting ? "Deleting..." : "Delete"}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
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
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground mb-2">
                      Uploaded on {new Date(selectedDoc.upload_date).toLocaleDateString()}
                    </p>
                    {selectedDoc.content && (
                      <div className="bg-muted p-4 rounded-lg mb-4">
                        <h4 className="font-semibold mb-2">Extracted Text Preview</h4>
                        <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                          {selectedDoc.content.slice(0, 300)}
                          {selectedDoc.content.length > 300 && '...'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {selectedDoc.content.length} characters extracted
                        </p>
                      </div>
                    )}
                    {selectedDoc.analysis && (
                      <div className="bg-muted p-4 rounded-lg">
                        <h4 className="font-semibold mb-2">Document Summary</h4>
                        <p className="text-muted-foreground whitespace-pre-wrap">
                          {selectedDoc.analysis}
                        </p>
                      </div>
                    )}
                    <div className="space-y-4">
                      <h4 className="font-semibold">Ask a Question</h4>
                      <Textarea
                        placeholder="What would you like to know about this document?"
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                      />
                      <Button 
                        onClick={handleAskQuestion}
                        disabled={isAnalyzing || !question.trim()}
                        className="w-full"
                      >
                        {isAnalyzing ? (
                          "Analyzing..."
                        ) : (
                          <>
                            <Send className="h-4 w-4 mr-2" />
                            Ask Question
                          </>
                        )}
                      </Button>
                      {answer && (
                        <div className="bg-muted p-4 rounded-lg mt-4">
                          <div className="flex justify-between items-center mb-2">
                            <h4 className="font-semibold">Answer</h4>
                            {answerModel && (
                              <Badge variant="outline" className="text-xs">
                                Model: {answerModel}
                              </Badge>
                            )}
                          </div>
                          <p className="text-muted-foreground whitespace-pre-wrap">
                            {answer}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Select a document to view its details and ask questions
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
