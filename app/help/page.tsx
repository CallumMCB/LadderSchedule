"use client";
import { Card, CardContent } from "@/components/ui/card";

export default function HelpPage() {
  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <Card>
        <CardContent className="p-6">
          <h1 className="text-2xl font-semibold mb-6">Tennis Doubles Ladder - User Guide</h1>
          
          <div className="space-y-8">
            
            {/* Getting Started */}
            <div>
              <h2 className="text-lg font-semibold mb-4">Getting Started</h2>
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-semibold text-xs mt-0.5">1</div>
                  <div>
                    <strong>Create Account:</strong> Register with your email and password to join the ladder system
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-semibold text-xs mt-0.5">2</div>
                  <div>
                    <strong>Choose Ladder:</strong> Go to Profile → Ladder Assignment to select which ladder you want to join
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-semibold text-xs mt-0.5">3</div>
                  <div>
                    <strong>Link Partner:</strong> In Profile → Partner Management, link with another player to form a doubles team
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-semibold text-xs mt-0.5">4</div>
                  <div>
                    <strong>Set Availability:</strong> Use the main calendar to mark when you're available to play tennis
                  </div>
                </div>
              </div>
            </div>

            {/* Ladder System */}
            <div>
              <h2 className="text-lg font-semibold mb-4">Multi-Ladder System</h2>
              <div className="space-y-2 text-sm">
                <p>The tennis ladder system has multiple separate ladders:</p>
                <ul className="list-disc ml-6 space-y-1">
                  <li><strong>Ladder Assignment:</strong> Each user belongs to one ladder at a time</li>
                  <li><strong>Switching Ladders:</strong> You can change ladders, but this clears all your data and moves you as a fresh team</li>
                  <li><strong>Partner Linking:</strong> If your partner is in a different ladder, linking will move you to their ladder</li>
                  <li><strong>Ladder-Specific:</strong> You only see teams, matches, and availability from your current ladder</li>
                </ul>
              </div>
            </div>

            {/* Visual Legend */}
            <div>
              <h2 className="text-lg font-semibold mb-4">Calendar Visual Guide</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Available */}
                <div className="flex items-center gap-3">
                  <div className="w-16 h-12 border border-gray-200 relative">
                    <div className="absolute right-0 top-0 bottom-1/2 left-1/2 bg-blue-500"></div>
                  </div>
                  <div>
                    <div className="font-medium">You can play</div>
                    <div className="text-sm text-gray-600">Top right quarter filled with your team color</div>
                  </div>
                </div>

                {/* Unavailable */}
                <div className="flex items-center gap-3">
                  <div className="w-16 h-12 border border-gray-200 relative">
                    <div className="absolute right-0 top-0 bottom-1/2 left-1/2 bg-black"></div>
                  </div>
                  <div>
                    <div className="font-medium">You cannot play</div>
                    <div className="text-sm text-gray-600">Top right quarter filled with black</div>
                  </div>
                </div>

                {/* Both available */}
                <div className="flex items-center gap-3">
                  <div className="w-16 h-12 border border-gray-200 relative">
                    <div className="absolute right-0 top-0 bottom-0 left-1/2 bg-blue-500"></div>
                  </div>
                  <div>
                    <div className="font-medium">Both partners available</div>
                    <div className="text-sm text-gray-600">Right half filled with team color</div>
                  </div>
                </div>

                {/* Other team available */}
                <div className="flex items-center gap-3">
                  <div className="w-16 h-12 border border-gray-200 relative">
                    <div className="absolute left-0 top-0 bottom-0 w-2 bg-red-500"></div>
                  </div>
                  <div>
                    <div className="font-medium">Other team available</div>
                    <div className="text-sm text-gray-600">Left side column in different team color</div>
                  </div>
                </div>

                {/* Confirmed match */}
                <div className="flex items-center gap-3">
                  <div className="w-16 h-12 border border-gray-300 relative">
                    <div className="absolute left-0 top-0 bottom-0 right-1/2 bg-blue-500"></div>
                    <div className="absolute right-0 top-0 bottom-0 left-1/2 bg-red-500"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs text-white bg-black bg-opacity-60 px-1 rounded font-semibold">MATCH</span>
                    </div>
                  </div>
                  <div>
                    <div className="font-medium">Confirmed match</div>
                    <div className="text-sm text-gray-600">Both team colors with MATCH label</div>
                  </div>
                </div>

                {/* Editing stripes */}
                <div className="flex items-center gap-3">
                  <div className="w-16 h-12 border border-gray-200 relative">
                    <div className="absolute right-0 top-0 bottom-0 left-1/2 bg-blue-500"></div>
                    <div 
                      className="absolute right-0 top-0 bottom-0 left-1/2"
                      style={{
                        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, #EF4444 2px, #EF4444 3px)'
                      }}
                    />
                  </div>
                  <div>
                    <div className="font-medium">Set by another team</div>
                    <div className="text-sm text-gray-600">Thin stripes show who made the change</div>
                  </div>
                </div>
              </div>
            </div>

            {/* How to use */}
            <div>
              <h2 className="text-lg font-semibold mb-4">How to Set Availability</h2>
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-semibold text-xs mt-0.5">1</div>
                  <div>
                    <strong>Single click:</strong> Cycle through normal → available → unavailable → normal
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-semibold text-xs mt-0.5">2</div>
                  <div>
                    <strong>Double click:</strong> Set both you and your partner as available for that time
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-semibold text-xs mt-0.5">3</div>
                  <div>
                    <strong>Block selection:</strong> Use "Select Block" button, click two corners to define a rectangle
                  </div>
                </div>
              </div>
            </div>

            {/* Act on behalf */}
            <div>
              <h2 className="text-lg font-semibold mb-4">Acting on Behalf of Other Teams</h2>
              <div className="space-y-2 text-sm">
                <p>You can set availability for other teams:</p>
                <ul className="list-disc ml-6 space-y-1">
                  <li>Select a team from "Act on behalf of" dropdown</li>
                  <li>Choose to act for one player or both players</li>
                  <li>Your changes will show thin stripes in your team's color</li>
                  <li>Click "Save Changes" to commit the changes</li>
                </ul>
              </div>
            </div>

            {/* Match confirmation */}
            <div>
              <h2 className="text-lg font-semibold mb-4">Match Confirmation & Scoring</h2>
              <div className="space-y-2 text-sm">
                <p>When both teams are available for the same time slot:</p>
                <ul className="list-disc ml-6 space-y-1">
                  <li>A popup will appear asking you to confirm a match</li>
                  <li>If multiple teams are available, you can choose your opponent</li>
                  <li>Once confirmed, the time slot shows both team colors with "MATCH" label</li>
                  <li>Team members can click on confirmed matches to cancel them</li>
                  <li>Only players from the teams involved in the match can cancel it</li>
                </ul>
                <p className="mt-3"><strong>After Playing:</strong></p>
                <ul className="list-disc ml-6 space-y-1">
                  <li>Go to the "Scoring" page to record match results</li>
                  <li>Enter the score for both teams and mark the match as completed</li>
                  <li>View win/loss records and match history on the Scoring page</li>
                </ul>
              </div>
            </div>

            {/* Navigation */}
            <div>
              <h2 className="text-lg font-semibold mb-4">Navigation</h2>
              <div className="space-y-2 text-sm">
                <ul className="list-disc ml-6 space-y-1">
                  <li><strong>Home:</strong> Main availability calendar for setting your schedule</li>
                  <li><strong>Scoring:</strong> View and record match results, see win/loss records</li>
                  <li><strong>Opponents:</strong> Browse all teams in your current ladder</li>
                  <li><strong>Profile:</strong> Manage your account, partner links, and ladder assignment</li>
                  <li><strong>Help:</strong> This guide with instructions on how to use the system</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}