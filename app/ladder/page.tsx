"use client";
import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Team = {
  id: string;
  member1: { id: string; email: string; name?: string };
  member2?: { id: string; email: string; name?: string };
  color: string;
  isComplete?: boolean;
  lookingForPartner?: boolean;
};

type Match = {
  id: string;
  startAt: string;
  team1Id: string;
  team2Id: string;
  team1Score?: number;
  team2Score?: number;
  team1DetailedScore?: string;
  team2DetailedScore?: string;
  completed?: boolean;
  confirmed?: boolean;
};

type LadderData = {
  id: string;
  name: string;
  number: number;
  endDate: string;
  teams: Team[];
  matches: Match[];
};

export default function WholeLadderPage() {
  const { data: session } = useSession();
  const [ladders, setLadders] = useState<LadderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'summary' | 'scores'>('summary');

  useEffect(() => {
    if (session) {
      loadAllLadders();
    }
  }, [session]);

  async function loadAllLadders() {
    setLoading(true);
    try {
      // Get all ladders
      const laddersResponse = await fetch('/api/ladders');
      if (!laddersResponse.ok) return;
      
      const laddersData = await laddersResponse.json();
      const allLadders = laddersData.allLadders || [];

      // For each ladder, get teams and matches
      const ladderPromises = allLadders.map(async (ladder: any) => {
        const [teamsResponse, matchesResponse] = await Promise.all([
          fetch(`/api/opponents?ladderId=${ladder.id}`),
          fetch(`/api/matches/all?ladderId=${ladder.id}`)
        ]);

        const teamsData = teamsResponse.ok ? await teamsResponse.json() : { teams: [] };
        const matchesData = matchesResponse.ok ? await matchesResponse.json() : { matches: [] };

        return {
          ...ladder,
          teams: teamsData.teams || [],
          matches: matchesData.matches || []
        };
      });

      const laddersWithData = await Promise.all(ladderPromises);
      setLadders(laddersWithData);
    } catch (error) {
      console.error("Failed to load ladder data:", error);
    } finally {
      setLoading(false);
    }
  }

  function getTeamDisplayName(team: Team): string {
    const name1 = team.member1.name || team.member1.email.split('@')[0];
    if (!team.member2 || team.member2.id === team.member1.id) {
      return `${name1} (solo)`;
    }
    const name2 = team.member2.name || team.member2.email.split('@')[0];
    return `${name1} & ${name2}`;
  }

  function getTeamResults(teamId: string, matches: Match[], teams: Team[]) {
    const results = { wins: 0, losses: 0, totalGames: 0, gamesWon: 0 };
    
    const playedMatches = matches.filter(match => 
      match.completed && 
      (match.team1Id === teamId || match.team2Id === teamId) &&
      match.team1Score !== null && match.team1Score !== undefined &&
      match.team2Score !== null && match.team2Score !== undefined
    );

    playedMatches.forEach(match => {
      const isTeam1 = match.team1Id === teamId;
      
      // Get detailed scores if available, otherwise use final scores
      const team1DetailedScore = match.team1DetailedScore || match.team1Score?.toString() || "";
      const team2DetailedScore = match.team2DetailedScore || match.team2Score?.toString() || "";
      
      let teamGames = 0;
      let opponentGames = 0;
      
      if (team1DetailedScore.includes(',') || team2DetailedScore.includes(',')) {
        // Set-based scoring - sum up all games from all sets
        const team1Sets = team1DetailedScore.split(',').map(s => s.trim());
        const team2Sets = team2DetailedScore.split(',').map(s => s.trim());
        
        team1Sets.forEach((setScore, index) => {
          if (setScore !== 'X' && setScore !== '') {
            teamGames += isTeam1 ? parseInt(setScore) || 0 : parseInt(team2Sets[index]) || 0;
            opponentGames += isTeam1 ? parseInt(team2Sets[index]) || 0 : parseInt(setScore) || 0;
          }
        });
      } else {
        // Simple scoring - these are likely already total games or match scores
        teamGames = isTeam1 ? match.team1Score! : match.team2Score!;
        opponentGames = isTeam1 ? match.team2Score! : match.team1Score!;
      }
      
      // Count match wins/losses based on final scores
      const teamMatchScore = isTeam1 ? match.team1Score! : match.team2Score!;
      const opponentMatchScore = isTeam1 ? match.team2Score! : match.team1Score!;
      
      if (teamMatchScore > opponentMatchScore) {
        results.wins++;
      } else if (opponentMatchScore > teamMatchScore) {
        results.losses++;
      }
      
      results.totalGames += teamGames + opponentGames;
      results.gamesWon += teamGames;
    });
    
    return results;
  }

  function getLadderStandings(ladder: LadderData) {
    const standings = ladder.teams.map(team => {
      const results = getTeamResults(team.id, ladder.matches, ladder.teams);
      return {
        team,
        ...results,
        winPercentage: results.wins + results.losses > 0 ? (results.wins / (results.wins + results.losses)) * 100 : 0
      };
    });

    // Sort by wins (descending), then by win percentage
    return standings.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.winPercentage - a.winPercentage;
    });
  }

  function calculateNextLadder(currentLadder: LadderData, position: number, totalTeams: number, allLadders: LadderData[]): string {
    const currentLadderNumber = currentLadder.number;
    const sortedLadders = [...allLadders].sort((a, b) => a.number - b.number);
    
    // Special case: only 3 teams
    if (totalTeams === 3) {
      if (position === 1) {
        // 1st place goes up 1 ladder
        const targetLadder = sortedLadders.find(l => l.number === currentLadderNumber - 1);
        return targetLadder ? `Ladder ${targetLadder.number}` : `Ladder ${currentLadderNumber}`;
      } else if (position === 3) {
        // Last place goes down 1 ladder
        const targetLadder = sortedLadders.find(l => l.number === currentLadderNumber + 1);
        return targetLadder ? `Ladder ${targetLadder.number}` : `Ladder ${currentLadderNumber}`;
      }
      // 2nd place stays
      return `Ladder ${currentLadderNumber}`;
    }

    // Regular logic for 4+ teams
    if (position === 1) {
      // 1st place: go up 2 ladders if possible
      const targetNumber = Math.max(1, currentLadderNumber - 2);
      const availableLadders = sortedLadders.filter(l => l.number < currentLadderNumber);
      if (availableLadders.length === 0) return `Ladder ${currentLadderNumber}`;
      
      const targetLadder = availableLadders.find(l => l.number === targetNumber) || availableLadders[0];
      return `Ladder ${targetLadder.number}`;
    } else if (position === 2) {
      // 2nd place: go up 1 ladder if possible
      const targetLadder = sortedLadders.find(l => l.number === currentLadderNumber - 1);
      return targetLadder ? `Ladder ${targetLadder.number}` : `Ladder ${currentLadderNumber}`;
    } else if (position === totalTeams) {
      // Last place: go down 2 ladders if possible
      const availableLadders = sortedLadders.filter(l => l.number > currentLadderNumber);
      if (availableLadders.length === 0) return `Ladder ${currentLadderNumber}`;
      
      const targetNumber = currentLadderNumber + 2;
      const targetLadder = availableLadders.find(l => l.number === targetNumber) || availableLadders[availableLadders.length - 1];
      return `Ladder ${targetLadder.number}`;
    } else if (position === totalTeams - 1) {
      // Second last: go down 1 ladder if possible
      const targetLadder = sortedLadders.find(l => l.number === currentLadderNumber + 1);
      return targetLadder ? `Ladder ${targetLadder.number}` : `Ladder ${currentLadderNumber}`;
    }

    // Everyone else stays
    return `Ladder ${currentLadderNumber}`;
  }

  function getMatchBetweenTeams(team1Id: string, team2Id: string, matches: Match[]): Match | undefined {
    return matches.find(match => 
      (match.team1Id === team1Id && match.team2Id === team2Id) ||
      (match.team1Id === team2Id && match.team2Id === team1Id)
    );
  }

  function formatScore(match: Match, isTeam1First: boolean) {
    if (!match.completed || match.team1Score === null || match.team2Score === null) {
      return null;
    }

    const team1Score = match.team1DetailedScore || match.team1Score?.toString() || "";
    const team2Score = match.team2DetailedScore || match.team2Score?.toString() || "";
    
    if (team1Score.includes(',') || team2Score.includes(',')) {
      // Set-based scoring
      return isTeam1First ? `${team1Score} : ${team2Score}` : `${team2Score} : ${team1Score}`;
    } else {
      // Simple scoring
      return isTeam1First ? `${team1Score}:${team2Score}` : `${team2Score}:${team1Score}`;
    }
  }

  if (!session) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <Card>
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-semibold mb-4">Please log in</h2>
            <p className="text-muted-foreground mb-4">You need to be logged in to view ladder standings.</p>
            <div className="space-y-2">
              <Button onClick={() => window.location.href = '/login'} className="w-full">
                Go to Login
              </Button>
              <p className="text-xs text-muted-foreground">
                Don't have an account?{' '}
                <a href="/register" className="text-blue-600 hover:underline">
                  Register here
                </a>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-4">
        <div className="text-center py-8">
          <h1 className="text-2xl font-semibold mb-4">Loading Ladder Standings...</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Whole Ladder {viewMode === 'summary' ? 'Standings' : 'Scores'}</h1>
        <div className="flex items-center gap-4">
          {/* View Mode Toggle */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('summary')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'summary'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Summary
            </button>
            <button
              onClick={() => setViewMode('scores')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'scores'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Scores
            </button>
          </div>
          <Button onClick={loadAllLadders} variant="outline">
            🔄 Refresh Data
          </Button>
        </div>
      </div>

      {ladders.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No ladders found.
        </div>
      ) : (
        <div className="space-y-8">
          {ladders.map(ladder => {
            const standings = getLadderStandings(ladder);
            
            return (
              <Card key={ladder.id}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-2xl font-semibold">{ladder.name}</h2>
                      <p className="text-sm text-muted-foreground">
                        Ends: {new Date(ladder.endDate).toLocaleDateString()} • {ladder.teams.length} teams • {ladder.matches.filter(m => m.completed).length} completed matches
                      </p>
                    </div>
                  </div>

                  {ladder.teams.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No teams in this ladder.
                    </div>
                  ) : viewMode === 'summary' ? (
                    // Summary View (Rankings Table)
                    <div className="overflow-auto rounded-lg border">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="p-3 text-left font-medium">Rank</th>
                            <th className="p-3 text-left font-medium">Team</th>
                            <th className="p-3 text-center font-medium">Matches Won</th>
                            <th className="p-3 text-center font-medium">Matches Lost</th>
                            <th className="p-3 text-center font-medium">Win %</th>
                            <th className="p-3 text-center font-medium">Games Won</th>
                            <th className="p-3 text-center font-medium">Next Ladder</th>
                          </tr>
                        </thead>
                        <tbody>
                          {standings.map((standing, index) => (
                            <tr key={standing.team.id} className="border-b">
                              <td className="p-3 font-medium">
                                <div className="flex items-center">
                                  <span className="text-lg">{index + 1}</span>
                                  {index === 0 && standings[0].wins > 0 && (
                                    <span className="ml-2 text-yellow-500">👑</span>
                                  )}
                                </div>
                              </td>
                              <td className="p-3">
                                <div className="flex items-center gap-3">
                                  <div 
                                    className="w-4 h-4 rounded"
                                    style={{ backgroundColor: standing.team.color }}
                                  />
                                  <span className="font-medium">
                                    {getTeamDisplayName(standing.team)}
                                  </span>
                                </div>
                              </td>
                              <td className="p-3 text-center font-medium text-green-600">
                                {standing.wins}
                              </td>
                              <td className="p-3 text-center font-medium text-red-600">
                                {standing.losses}
                              </td>
                              <td className="p-3 text-center">
                                {standing.wins + standing.losses > 0 
                                  ? `${standing.winPercentage.toFixed(1)}%`
                                  : '-'
                                }
                              </td>
                              <td className="p-3 text-center">
                                {standing.gamesWon}
                              </td>
                              <td className="p-3 text-center font-medium">
                                {calculateNextLadder(ladder, index + 1, standings.length, ladders)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    // Scores View (Match Results Table)
                    <div className="overflow-auto rounded-lg border">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="p-3 text-left font-medium">Team</th>
                            {ladder.teams.map(team => (
                              <th key={team.id} className="p-2 text-center font-medium min-w-[120px]">
                                <div 
                                  className="text-xs px-2 py-1 rounded text-white"
                                  style={{ backgroundColor: team.color }}
                                >
                                  {getTeamDisplayName(team).length > 15 
                                    ? getTeamDisplayName(team).substring(0, 15) + '...'
                                    : getTeamDisplayName(team)
                                  }
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {ladder.teams.map(rowTeam => (
                            <tr key={rowTeam.id} className="border-b">
                              <td className="p-3 font-medium">
                                <div 
                                  className="text-sm px-3 py-2 rounded text-white"
                                  style={{ backgroundColor: rowTeam.color }}
                                >
                                  {getTeamDisplayName(rowTeam)}
                                </div>
                              </td>
                              {ladder.teams.map(colTeam => {
                                if (rowTeam.id === colTeam.id) {
                                  return (
                                    <td key={colTeam.id} className="p-2 bg-gray-100">
                                      <div className="text-center text-gray-400 text-sm">—</div>
                                    </td>
                                  );
                                }

                                const match = getMatchBetweenTeams(rowTeam.id, colTeam.id, ladder.matches);
                                const isRowTeamFirst = match ? match.team1Id === rowTeam.id : false;
                                
                                if (!match) {
                                  return (
                                    <td key={colTeam.id} className="p-2 text-center">
                                      <div className="text-gray-400 text-xs">No match</div>
                                    </td>
                                  );
                                }

                                const scoreDisplay = formatScore(match, isRowTeamFirst);

                                return (
                                  <td key={colTeam.id} className="p-2">
                                    <div className="text-center">
                                      {scoreDisplay ? (
                                        <div className="text-sm font-mono">
                                          {scoreDisplay}
                                        </div>
                                      ) : (
                                        <div className="text-xs text-gray-500">
                                          {match.confirmed ? 'Scheduled' : 'Pending'}
                                        </div>
                                      )}
                                      <div className="text-xs text-gray-400 mt-1">
                                        {new Date(match.startAt).toLocaleDateString()}
                                      </div>
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}