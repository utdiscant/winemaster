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
  const mapUrl = `https://worldwineregions.com/wwrmap/#view=${question.mapZoom}/${question.mapLatitude}/${question.mapLongitude}&ui=minimal&search=false&labels=false&info=false&attribution=false`;
  
  const isLocationToName = question.mapVariant === 'location-to-name';

  return (
    <div className="space-y-4">
      {/* Map Display */}
      <Card className="overflow-hidden relative">
        <CardContent className="p-0 relative">
          <iframe
            src={mapUrl}
            className="w-full h-96 border-0"
            title="Wine Region Map"
            data-testid="map-iframe"
            style={{
              clipPath: 'inset(0 0 25px 0)'
            }}
          />
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-background to-transparent opacity-90" />
            <div className="absolute bottom-0 left-0 right-0 h-12 bg-background" />
            <div className="absolute bottom-0 left-0 w-16 h-16 bg-background" />
          </div>
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
