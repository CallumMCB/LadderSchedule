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
  matchFormat?: {
    sets: number;
    gamesPerSet: number;
    winnerBy: string;
  };
};

export default function WholeLadderPage() {
  const { data: session } = useSession();
  const [ladders, setLadders] = useState<LadderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'summary' | 'scores'>('summary');
  const [showFormatEditor, setShowFormatEditor] = useState<string | null>(null);
  const [showFormatModal, setShowFormatModal] = useState<{
    ladderId: string;
    matchFormat: { sets: number; gamesPerSet: number; winnerBy: string };
  } | null>(null);

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
      console.log('Ladder data:', laddersWithData[0]); // Debug log
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

  function getTeamResults(teamId: string, matches: Match[], teams: Team[], matchFormat?: { sets: number; gamesPerSet: number; winnerBy: string }) {
    const results = { wins: 0, losses: 0, totalGames: 0, gamesWon: 0, setsWon: 0 };
    
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
      let teamSets = 0;
      let opponentSets = 0;
      
      if (team1DetailedScore.includes(',') || team2DetailedScore.includes(',')) {
        // Set-based scoring - sum up all games from all sets and count sets
        const team1Sets = team1DetailedScore.split(',').map(s => s.trim());
        const team2Sets = team2DetailedScore.split(',').map(s => s.trim());
        
        team1Sets.forEach((setScore, index) => {
          const team2SetScore = team2Sets[index] || "";
          if (setScore !== 'X' && setScore !== '' && team2SetScore !== 'X' && team2SetScore !== '') {
            const t1Games = parseInt(setScore) || 0;
            const t2Games = parseInt(team2SetScore) || 0;
            
            if (isTeam1) {
              teamGames += t1Games;
              opponentGames += t2Games;
              if (t1Games > t2Games) teamSets++;
              else if (t2Games > t1Games) opponentSets++;
            } else {
              teamGames += t2Games;
              opponentGames += t1Games;
              if (t2Games > t1Games) teamSets++;
              else if (t1Games > t2Games) opponentSets++;
            }
          }
        });
      } else {
        // Simple scoring - these are likely already total games or match scores
        teamGames = isTeam1 ? match.team1Score! : match.team2Score!;
        opponentGames = isTeam1 ? match.team2Score! : match.team1Score!;
        // For simple scoring, assume sets won equals match score
        teamSets = teamGames;
        opponentSets = opponentGames;
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
      results.setsWon += teamSets;
    });
    
    return results;
  }

  function getHeadToHeadResult(team1Id: string, team2Id: string, matches: Match[]): number {
    // Returns 1 if team1 won, -1 if team2 won, 0 if no match or tied
    const match = matches.find(match => 
      match.completed &&
      ((match.team1Id === team1Id && match.team2Id === team2Id) ||
       (match.team1Id === team2Id && match.team2Id === team1Id)) &&
      match.team1Score !== null && match.team1Score !== undefined &&
      match.team2Score !== null && match.team2Score !== undefined
    );

    if (!match) return 0;

    const isTeam1First = match.team1Id === team1Id;
    const team1Score = isTeam1First ? match.team1Score! : match.team2Score!;
    const team2Score = isTeam1First ? match.team2Score! : match.team1Score!;

    if (team1Score > team2Score) return 1;
    if (team2Score > team1Score) return -1;
    return 0;
  }

  function getLadderStandings(ladder: LadderData) {
    const standings = ladder.teams.map(team => {
      const results = getTeamResults(team.id, ladder.matches, ladder.teams, ladder.matchFormat);
      return {
        team,
        ...results,
        winPercentage: results.wins + results.losses > 0 ? (results.wins / (results.wins + results.losses)) * 100 : 0
      };
    });

    // Sort based on match format
    return standings.sort((a, b) => {
      if (ladder.matchFormat?.winnerBy === 'games') {
        // Games-based format: Sort by total games won, then by matches won, then by head-to-head
        if (b.gamesWon !== a.gamesWon) return b.gamesWon - a.gamesWon;
        if (b.wins !== a.wins) return b.wins - a.wins;
        // Head-to-head tie-breaker
        const headToHead = getHeadToHeadResult(a.team.id, b.team.id, ladder.matches);
        if (headToHead !== 0) return headToHead;
        return b.winPercentage - a.winPercentage;
      } else {
        // Sets-based format: Sort by matches won, then by sets won, then by head-to-head
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.setsWon !== a.setsWon) return b.setsWon - a.setsWon;
        // Head-to-head tie-breaker
        const headToHead = getHeadToHeadResult(a.team.id, b.team.id, ladder.matches);
        if (headToHead !== 0) return headToHead;
        return b.winPercentage - a.winPercentage;
      }
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

  async function updateLadderFormat(ladderId: string, newSets: number) {
    try {
      console.log(`[FRONTEND] Updating ladder ${ladderId} to ${newSets} sets`);
      console.log(`[FRONTEND] Button clicked for ${newSets} sets`);
      
      const newMatchFormat = {
        sets: newSets,
        gamesPerSet: 6,
        winnerBy: "sets"
      };

      console.log(`[FRONTEND] Sending API request to update ladder format`);
      console.log(`[FRONTEND] Request data:`, { ladderId, newMatchFormat });

      const response = await fetch('/api/ladders/update-format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ladderId,
          newMatchFormat
        })
      });

      console.log(`[FRONTEND] Response status:`, response.status);
      console.log(`[FRONTEND] Response ok:`, response.ok);
      
      if (response.ok) {
        const result = await response.json();
        console.log('Update result:', result);
        console.log(`Updated ladder format and ${result.updatedMatches} matches`);
        // Reload ladder data to reflect changes with cache busting
        setTimeout(async () => {
          await loadAllLadders();
          setShowFormatEditor(null);
        }, 500);
      } else {
        const errorData = await response.json();
        console.error('Failed to update ladder format:', errorData);
      }
    } catch (error) {
      console.error('Error updating ladder format:', error);
    }
  }

  function calculateMovementWithDestination(currentLadder: LadderData, position: number, totalTeams: number, allLadders: LadderData[]): string {
    const currentLadderNumber = currentLadder.number;
    const nextLadder = calculateNextLadder(currentLadder, position, totalTeams, allLadders);
    const nextLadderNumber = parseInt(nextLadder.replace('Ladder ', ''));
    
    if (nextLadderNumber === currentLadderNumber) {
      return `— Ladder ${currentLadderNumber}`; // Stay in same ladder
    } else if (nextLadderNumber < currentLadderNumber) {
      return `⬆️ Ladder ${nextLadderNumber}`;
    } else {
      return `⬇️ Ladder ${nextLadderNumber}`;
    }
  }

  function getMatchBetweenTeams(team1Id: string, team2Id: string, matches: Match[]): Match | undefined {
    return matches.find(match => 
      (match.team1Id === team1Id && match.team2Id === team2Id) ||
      (match.team1Id === team2Id && match.team2Id === team1Id)
    );
  }

  function getSetScore(scoreString: string, setIndex: number): string {
    if (!scoreString) return "";
    const sets = scoreString.split(',');
    return sets[setIndex] || "";
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
    <div className="max-w-6xl mx-auto p-0 md:p-4 space-y-4 md:space-y-8">
      <div className="flex items-center justify-between px-4 md:px-0">
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
        <div className="text-center py-8 text-muted-foreground px-4 md:px-0">
          No ladders found.
        </div>
      ) : (
        <div className="space-y-4 md:space-y-8">
          {ladders.map(ladder => {
            const standings = getLadderStandings(ladder);
            
            return (
              <Card key={ladder.id} className="md:shadow-md md:border md:rounded-lg shadow-none border-none rounded-none">
                <CardContent className="p-4 md:p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-2xl font-semibold">{ladder.name}</h2>
                      <p className="text-sm text-muted-foreground">
                        Ends: {new Date(ladder.endDate).toLocaleDateString()} • {ladder.teams.length} teams • {ladder.matches.filter(m => m.completed).length}/{ladder.matches.length} completed matches
                        {ladder.matchFormat && (
                          <span> • {ladder.matchFormat.sets} set{ladder.matchFormat.sets > 1 ? 's' : ''}</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <Button 
                        onClick={() => setShowFormatModal({
                          ladderId: ladder.id,
                          matchFormat: ladder.matchFormat || { sets: 3, gamesPerSet: 6, winnerBy: 'sets' }
                        })}
                        variant="outline"
                        size="sm"
                      >
                        Change Format
                      </Button>
                    </div>
                  </div>


                  {ladder.teams.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No teams in this ladder.
                    </div>
                  ) : viewMode === 'summary' ? (
                    // Summary View (Rankings Table)
                    <div className="overflow-auto md:rounded-lg md:border rounded-none border-none">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="p-3 text-left font-medium">Rank</th>
                            <th className="p-3 text-left font-medium">Team</th>
                            <th className="p-3 text-center font-medium">Matches Won</th>
                            <th className="p-3 text-center font-medium">Matches Lost</th>
                            <th className="p-3 text-center font-medium">Win %</th>
                            <th className="p-3 text-center font-medium">
                              {ladder.matchFormat?.winnerBy === 'games' ? 'Games Won' : 'Sets Won'}
                            </th>
                            <th className="p-3 text-center font-medium">Next Season</th>
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
                                {ladder.matchFormat?.winnerBy === 'games' ? standing.gamesWon : standing.setsWon}
                              </td>
                              <td className="p-3 text-center font-medium text-sm">
                                {calculateMovementWithDestination(ladder, index + 1, standings.length, ladders)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    // Scores View (Match Results Table) - Matching scoring page style
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
                                const isRowTeamFirst = match && match.team1Id === rowTeam.id;
                                
                                if (!match) {
                                  return (
                                    <td key={colTeam.id} className="p-2 text-center">
                                      <div className="text-gray-400 text-xs mb-1">No match</div>
                                    </td>
                                  );
                                }

                                const scoreData = {
                                  team1Score: match.team1DetailedScore || match.team1Score?.toString() || "",
                                  team2Score: match.team2DetailedScore || match.team2Score?.toString() || ""
                                };
                                const rowTeamScore = isRowTeamFirst ? scoreData.team1Score : scoreData.team2Score;
                                const colTeamScore = isRowTeamFirst ? scoreData.team2Score : scoreData.team1Score;

                                return (
                                  <td key={colTeam.id} className="p-2">
                                    <div className="flex justify-center">
                                      {match.completed ? (
                                        // Completed match - show score table like scoring page
                                        <table className="text-xs border-collapse">
                                          <thead>
                                            <tr>
                                              <th className="w-4"></th>
                                              {Array.from({ length: ladder.matchFormat?.sets || 3 }, (_, setIndex) => (
                                                <th key={setIndex} className="text-center text-xs font-medium text-gray-600 px-1">
                                                  S{setIndex + 1}
                                                </th>
                                              ))}
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {/* Row team scores */}
                                            <tr>
                                              <td className="pr-2 text-center">
                                                <div 
                                                  className="w-2 h-2 rounded-full mx-auto"
                                                  style={{ backgroundColor: rowTeam.color }}
                                                />
                                              </td>
                                              {Array.from({ length: ladder.matchFormat?.sets || 3 }, (_, setIndex) => (
                                                <td key={setIndex}>
                                                  <div className="w-9 h-5 text-center text-xs border rounded flex items-center justify-center bg-white">
                                                    {getSetScore(rowTeamScore, setIndex) || '0'}
                                                  </div>
                                                </td>
                                              ))}
                                            </tr>
                                            
                                            {/* Column team scores */}
                                            <tr>
                                              <td className="pr-2 text-center">
                                                <div 
                                                  className="w-2 h-2 rounded-full mx-auto"
                                                  style={{ backgroundColor: colTeam.color }}
                                                />
                                              </td>
                                              {Array.from({ length: ladder.matchFormat?.sets || 3 }, (_, setIndex) => (
                                                <td key={setIndex}>
                                                  <div className="w-9 h-5 text-center text-xs border rounded flex items-center justify-center bg-white">
                                                    {getSetScore(colTeamScore, setIndex) || '0'}
                                                  </div>
                                                </td>
                                              ))}
                                            </tr>
                                          </tbody>
                                        </table>
                                      ) : (
                                        // Unplayed match
                                        <div className="text-center">
                                          <div className="text-xs text-gray-500 mb-1">
                                            {match.confirmed ? 'Scheduled' : 'Pending'}
                                          </div>
                                          <div className="text-xs text-gray-400">
                                            {new Date(match.startAt).toLocaleDateString()}
                                          </div>
                                        </div>
                                      )}
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

      {/* Format Settings Modal - Copied from scoring page */}
      {showFormatModal && (
        <div className="fixed inset-0 z-50">
          <div 
            className="absolute inset-0 bg-black bg-opacity-50" 
            onClick={() => setShowFormatModal(null)}
          />
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg border p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">Match Format Settings</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Number of Sets</label>
                <select
                  value={showFormatModal.matchFormat.sets}
                  onChange={(e) => setShowFormatModal(prev => prev ? {
                    ...prev,
                    matchFormat: { ...prev.matchFormat, sets: parseInt(e.target.value) }
                  } : null)}
                  className="w-full p-2 border rounded-lg"
                >
                  <option value={1}>1 Set</option>
                  <option value={3}>3 Sets (Best of 3)</option>
                  <option value={5}>5 Sets (Best of 5)</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Games per Set</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={showFormatModal.matchFormat.gamesPerSet}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    if (!isNaN(value) && value >= 1 && value <= 20) {
                      setShowFormatModal(prev => prev ? {
                        ...prev,
                        matchFormat: { ...prev.matchFormat, gamesPerSet: value }
                      } : null);
                    }
                  }}
                  className="w-full p-2 border rounded-lg"
                  placeholder="6"
                />
                <p className="text-xs text-gray-500 mt-1">Enter number of games per set (1-20)</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Winner Determined By</label>
                <select
                  value={showFormatModal.matchFormat.winnerBy}
                  onChange={(e) => setShowFormatModal(prev => prev ? {
                    ...prev,
                    matchFormat: { ...prev.matchFormat, winnerBy: e.target.value as 'sets' | 'games' }
                  } : null)}
                  className="w-full p-2 border rounded-lg"
                >
                  <option value="sets">Most Sets Won</option>
                  <option value="games">Most Games Won</option>
                </select>
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                <div className="font-medium text-blue-900 mb-1">Current Format:</div>
                <div className="text-blue-800">
                  {showFormatModal.matchFormat.sets === 1 ? '1 Set' : `Best of ${showFormatModal.matchFormat.sets} Sets`} • {showFormatModal.matchFormat.gamesPerSet} Games per Set
                  <br />
                  Winner: {showFormatModal.matchFormat.winnerBy === 'sets' ? 'Most Sets' : 'Most Games'}
                </div>
              </div>
            </div>
            
            <div className="flex gap-3 justify-end mt-6">
              <Button
                variant="outline"
                onClick={() => setShowFormatModal(null)}
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (!showFormatModal) return;
                  
                  try {
                    const response = await fetch('/api/ladders/update-format', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        ladderId: showFormatModal.ladderId,
                        newMatchFormat: showFormatModal.matchFormat
                      }),
                    });

                    if (response.ok) {
                      setShowFormatModal(null);
                      // Reload data to reflect changes
                      setTimeout(async () => {
                        await loadAllLadders();
                      }, 500);
                    } else {
                      const error = await response.json();
                      console.error('Failed to update format:', error);
                    }
                  } catch (error) {
                    console.error('Network error updating format:', error);
                  }
                }}
              >
                Save Format
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}