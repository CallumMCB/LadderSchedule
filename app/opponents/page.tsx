"use client";
import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Mail, Phone, Users } from "lucide-react";

type Team = {
  id: string;
  member1: { id: string; email: string; name?: string; phone?: string };
  member2?: { id: string; email: string; name?: string; phone?: string };
  color: string;
  isComplete?: boolean;
  lookingForPartner?: boolean;
};

export default function OpponentsPage() {
  const { data: session } = useSession();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [myTeamId, setMyTeamId] = useState<string>();

  useEffect(() => {
    if (session) {
      loadTeams();
    }
  }, [session]);

  async function loadTeams() {
    try {
      const response = await fetch('/api/opponents');
      if (response.ok) {
        const data = await response.json();
        setTeams(data.teams || []);
        setMyTeamId(data.myTeamId);
      }
    } catch (error) {
      console.error("Failed to load teams:", error);
    } finally {
      setLoading(false);
    }
  }

  if (!session) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <Card>
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-semibold mb-4">Please log in</h2>
            <p className="text-muted-foreground">You need to be logged in to view opponents.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="text-center py-8">
          <p className="text-muted-foreground">Loading opponents...</p>
        </div>
      </div>
    );
  }

  // Filter out my own team
  const opponentTeams = teams.filter(team => team.id !== myTeamId);

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <Card>
        <CardContent className="p-6">
          <h1 className="text-2xl font-semibold mb-6 flex items-center gap-2">
            <Users className="h-6 w-6" />
            Opponents & Contact Information
          </h1>
          
          {opponentTeams.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No other teams found.</p>
              <p className="text-sm text-muted-foreground mt-2">
                Other players need to register and create teams to appear here.
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {opponentTeams.map(team => (
                <Card key={team.id} className="border-l-4" style={{ borderLeftColor: team.color }}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <div 
                            className="w-4 h-4 rounded"
                            style={{ backgroundColor: team.color }}
                          />
                          <h3 className="font-semibold text-lg">
                            {team.isComplete ? 'Team' : 'Solo Player'} 
                            {team.lookingForPartner && (
                              <span className="text-sm text-muted-foreground ml-2">(Looking for partner)</span>
                            )}
                          </h3>
                        </div>
                        
                        <div className="space-y-3">
                          {/* Member 1 */}
                          <div className="bg-gray-50 p-3 rounded-lg">
                            <h4 className="font-medium mb-2">
                              {team.member1.name || 'Player 1'}
                            </h4>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 text-sm">
                                <Mail className="h-4 w-4 text-gray-500" />
                                <a 
                                  href={`mailto:${team.member1.email}`}
                                  className="text-blue-600 hover:underline"
                                >
                                  {team.member1.email}
                                </a>
                              </div>
                              {team.member1.phone && (
                                <div className="flex items-center gap-2 text-sm">
                                  <Phone className="h-4 w-4 text-gray-500" />
                                  <a 
                                    href={`tel:${team.member1.phone}`}
                                    className="text-blue-600 hover:underline"
                                  >
                                    {team.member1.phone}
                                  </a>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Member 2 */}
                          {team.member2 && team.member2.id !== team.member1.id && (
                            <div className="bg-gray-50 p-3 rounded-lg">
                              <h4 className="font-medium mb-2">
                                {team.member2.name || 'Player 2'}
                              </h4>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 text-sm">
                                  <Mail className="h-4 w-4 text-gray-500" />
                                  <a 
                                    href={`mailto:${team.member2.email}`}
                                    className="text-blue-600 hover:underline"
                                  >
                                    {team.member2.email}
                                  </a>
                                </div>
                                {team.member2.phone && (
                                  <div className="flex items-center gap-2 text-sm">
                                    <Phone className="h-4 w-4 text-gray-500" />
                                    <a 
                                      href={`tel:${team.member2.phone}`}
                                      className="text-blue-600 hover:underline"
                                    >
                                      {team.member2.phone}
                                    </a>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-4">Contact Information Tips</h2>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>• Email addresses are always visible to coordinate matches</p>
            <p>• Phone numbers are only shown if players have added them to their profile</p>
            <p>• Click email or phone links to open your default mail/phone app</p>
            <p>• Update your own contact info in your Profile page</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}