
import React, { useState } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Upload } from "lucide-react";

interface Document {
  id: string;
  title: string;
  filename: string;
  uploadDate: string;
  analysis?: string;
}

const initialDocuments: Document[] = [
  {
    id: '1',
    title: 'Train Manual 2024',
    filename: 'train-manual-2024.pdf',
    uploadDate: '2024-04-19',
    analysis: 'This document contains maintenance procedures for XYZ trains.'
  },
  {
    id: '2',
    title: 'Safety Guidelines',
    filename: 'safety-guidelines-v2.pdf',
    uploadDate: '2024-04-18',
    analysis: 'Comprehensive safety protocols for train operations.'
  }
];

export const KnowledgeBase = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setSelectedDoc(null);
  };

  const filteredDocs = initialDocuments.filter((doc) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      doc.title.toLowerCase().includes(searchLower) ||
      doc.filename.toLowerCase().includes(searchLower)
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
          <Button className="gap-2">
            <Upload className="h-4 w-4" />
            Upload PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="h-[600px]">
          <CardHeader>
            <CardTitle>Documents</CardTitle>
            <CardDescription>
              {filteredDocs.length} documents found
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[480px] w-full pr-4">
              <div className="space-y-4">
                {filteredDocs.map((doc) => (
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
                            {doc.filename}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
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
                      Uploaded on {selectedDoc.uploadDate}
                    </p>
                    <p className="text-muted-foreground">
                      {selectedDoc.analysis || 'No analysis available yet.'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Select a document to view its AI analysis
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
