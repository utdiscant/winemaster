import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { QuizQuestion } from "@shared/schema";

interface MapQuestionProps {
  question: QuizQuestion;
  isAnswered: boolean;
  isCorrect: boolean;
  correctAnswer: string;
  textAnswer: string;
  onTextAnswerChange: (value: string) => void;
}

export default function MapQuestion({
  question,
  isAnswered,
  isCorrect,
  correctAnswer,
  textAnswer,
  onTextAnswerChange,
}: MapQuestionProps) {
  const mapUrl = `https://worldwineregions.com/wwrmap/#view=${question.mapZoom}/${question.mapLatitude}/${question.mapLongitude}`;
  
  const isLocationToName = question.mapVariant === 'location-to-name';

  return (
    <div className="space-y-4">
      {/* Map Display */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <iframe
            src={mapUrl}
            className="w-full h-96 border-0"
            title="Wine Region Map"
            data-testid="map-iframe"
          />
        </CardContent>
      </Card>

      {/* Question Instructions */}
      <div className="space-y-3">
        {isLocationToName ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Based on the map region shown above, type the name of this wine region:
            </p>
            <Input
              type="text"
              placeholder="Enter region name..."
              value={textAnswer}
              onChange={(e) => onTextAnswerChange(e.target.value)}
              disabled={isAnswered}
              className="max-w-md"
              data-testid="input-region-name"
            />
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Region to identify: <strong>{question.mapRegionName}</strong>
              {question.mapCountry && <span> ({question.mapCountry})</span>}
            </p>
            <p className="text-sm text-muted-foreground">
              View the map above to see where this region is located, then confirm your understanding:
            </p>
            <Input
              type="text"
              placeholder="Type the region name to confirm..."
              value={textAnswer}
              onChange={(e) => onTextAnswerChange(e.target.value)}
              disabled={isAnswered}
              className="max-w-md"
              data-testid="input-region-confirmation"
            />
          </div>
        )}

        {/* Show correct answer after submission */}
        {isAnswered && (
          <div className="flex items-center gap-2 mt-3">
            {isCorrect ? (
              <Badge variant="default" className="bg-green-600 dark:bg-green-700" data-testid="badge-correct">
                Correct! {correctAnswer}
              </Badge>
            ) : (
              <div className="flex flex-col gap-1">
                <Badge variant="destructive" data-testid="badge-incorrect">
                  Incorrect
                </Badge>
                <p className="text-sm text-muted-foreground">
                  Correct answer: <strong data-testid="text-correct-answer">{correctAnswer}</strong>
                  {question.mapCountry && <span> ({question.mapCountry})</span>}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
