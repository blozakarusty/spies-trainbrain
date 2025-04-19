
import React, { useState } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

// Example knowledge base data structure
interface TroubleshootingStep {
  step: number;
  description: string;
}

interface KnowledgeItem {
  id: string;
  type: 'fault' | 'question' | 'image';
  code?: string;
  question?: string;
  imageUrl?: string;
  title: string;
  description: string;
  steps: TroubleshootingStep[];
}

// Example initial data
const initialKnowledge: KnowledgeItem[] = [
  {
    id: '1',
    type: 'fault',
    code: 'ERR001',
    title: 'System Startup Error',
    description: 'Common system startup failure',
    steps: [
      { step: 1, description: 'Check power connection' },
      { step: 2, description: 'Verify all cables are properly connected' },
      { step: 3, description: 'Restart the system' },
    ]
  },
  {
    id: '2',
    type: 'question',
    question: 'Why is the display flickering?',
    title: 'Display Issues',
    description: 'Screen flickering troubleshooting',
    steps: [
      { step: 1, description: 'Check refresh rate settings' },
      { step: 2, description: 'Update graphics drivers' },
      { step: 3, description: 'Test with different cable' },
    ]
  }
];

export const KnowledgeBase = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<KnowledgeItem | null>(null);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setSelectedItem(null);
  };

  const filteredItems = initialKnowledge.filter((item) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      item.title.toLowerCase().includes(searchLower) ||
      item.description.toLowerCase().includes(searchLower) ||
      item.code?.toLowerCase().includes(searchLower) ||
      item.question?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">Knowledge Base</h1>
        <div className="flex gap-4">
          <Input
            type="text"
            placeholder="Search for fault codes, questions, or topics..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="flex-1"
          />
          <Button onClick={() => setSearchQuery('')}>Clear</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="h-[600px]">
          <CardHeader>
            <CardTitle>Search Results</CardTitle>
            <CardDescription>
              {filteredItems.length} items found
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[480px] w-full pr-4">
              <div className="space-y-4">
                {filteredItems.map((item) => (
                  <Card
                    key={item.id}
                    className={`cursor-pointer transition-colors hover:bg-muted ${
                      selectedItem?.id === item.id ? 'border-primary' : ''
                    }`}
                    onClick={() => setSelectedItem(item)}
                  >
                    <CardContent className="p-4">
                      <h3 className="font-semibold">{item.title}</h3>
                      {item.code && (
                        <p className="text-sm text-muted-foreground">
                          Fault Code: {item.code}
                        </p>
                      )}
                      {item.question && (
                        <p className="text-sm text-muted-foreground">
                          Q: {item.question}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="h-[600px]">
          <CardHeader>
            <CardTitle>Troubleshooting Steps</CardTitle>
            <CardDescription>
              {selectedItem ? selectedItem.title : 'Select an item to view steps'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[480px] w-full pr-4">
              {selectedItem ? (
                <div className="space-y-6">
                  <div>
                    <h3 className="font-semibold mb-2">Description</h3>
                    <p className="text-muted-foreground">
                      {selectedItem.description}
                    </p>
                  </div>
                  
                  {selectedItem.imageUrl && (
                    <img
                      src={selectedItem.imageUrl}
                      alt="Troubleshooting reference"
                      className="w-full rounded-lg mb-4"
                    />
                  )}

                  <div>
                    <h3 className="font-semibold mb-2">Steps</h3>
                    <div className="space-y-3">
                      {selectedItem.steps.map((step) => (
                        <div
                          key={step.step}
                          className="p-3 bg-muted rounded-lg"
                        >
                          <p className="font-medium">
                            Step {step.step}
                          </p>
                          <p className="text-muted-foreground">
                            {step.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Select an item from the search results to view troubleshooting steps
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
