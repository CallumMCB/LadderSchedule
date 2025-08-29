"use client";
import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  completed?: boolean;
};

type TeamsData = {
  teams: Team[];
  matches: Match[];
  myTeamId?: string;
};

function startOfWeekMonday(d: Date) {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

export default function ScoringPage() {
  const { data: session } = useSession();
  const [teamsData, setTeamsData] = useState<TeamsData>({ teams: [], matches: [] });
  const [scores, setScores] = useState<Record<string, { team1Score: string; team2Score: string }>>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [showScheduleModal, setShowScheduleModal] = useState<{team1Id: string; team2Id: string} | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleHour, setScheduleHour] = useState("18"); // Default to 6pm (18 in 24-hour format)
  const [scheduleMinute, setScheduleMinute] = useState("00"); // Default to 00 minutes
  const [selectedLadderId, setSelectedLadderId] = useState<string>("");
  const [ladderInfo, setLadderInfo] = useState<{
    currentLadder?: { id: string; name: string; number: number; endDate: string };
    allLadders: Array<{ id: string; name: string; number: number; endDate: string }>;
  }>({ allLadders: [] });

  useEffect(() => {
    if (session) {
      loadLadderInfo();
    }
  }, [session]);

  useEffect(() => {
    if (session && selectedLadderId) {
      loadTeamsAndMatches();
    }
  }, [session, selectedLadderId]);

  async function loadLadderInfo() {
    try {
      const response = await fetch('/api/ladders');
      if (response.ok) {
        const data = await response.json();
        setLadderInfo(data);
        // Set current ladder as default selection
        if (data.currentLadder) {
          setSelectedLadderId(data.currentLadder.id);
        }
      }
    } catch (error) {
      console.error("Failed to load ladder info:", error);
    }
  }

  async function loadTeamsAndMatches() {
    try {
      // Load all teams/opponents in the ladder
      const teamsResponse = await fetch(`/api/opponents?ladderId=${selectedLadderId}`);
      
      // Load all matches across all weeks for selected ladder
      const allMatchesResponse = await fetch(`/api/matches/all?ladderId=${selectedLadderId}`);
      
      if (teamsResponse.ok && allMatchesResponse.ok) {
        const teamsData = await teamsResponse.json();
        const allMatchesData = await allMatchesResponse.json();
        
        setTeamsData({
          ...teamsData,
          matches: allMatchesData.matches || []
        });
        
        // Initialize scores from existing match data
        const initialScores: Record<string, { team1Score: string; team2Score: string }> = {};
        allMatchesData.matches?.forEach((match: Match) => {
          initialScores[match.id] = {
            team1Score: match.team1Score?.toString() || "",
            team2Score: match.team2Score?.toString() || ""
          };
        });
        setScores(initialScores);
      }
    } catch (error) {
      console.error("Failed to load teams and matches:", error);
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

  function getMatchBetweenTeams(team1Id: string, team2Id: string): Match | undefined {
    return teamsData.matches.find(match => 
      (match.team1Id === team1Id && match.team2Id === team2Id) ||
      (match.team1Id === team2Id && match.team2Id === team1Id)
    );
  }

  function getTeamResults(teamId: string): Array<{ won: boolean; opponent: Team; match: Match }> {
    const results: Array<{ won: boolean; opponent: Team; match: Match }> = [];
    
    const playedMatches = teamsData.matches.filter(match => 
      match.completed && 
      (match.team1Id === teamId || match.team2Id === teamId) &&
      match.team1Score !== null && match.team1Score !== undefined &&
      match.team2Score !== null && match.team2Score !== undefined
    );

    playedMatches.forEach(match => {
      const isTeam1 = match.team1Id === teamId;
      const teamScore = isTeam1 ? match.team1Score! : match.team2Score!;
      const opponentScore = isTeam1 ? match.team2Score! : match.team1Score!;
      const opponentId = isTeam1 ? match.team2Id : match.team1Id;
      const opponent = teams.find(t => t.id === opponentId);
      
      if (opponent) {
        results.push({
          won: teamScore > opponentScore,
          opponent,
          match
        });
      }
    });

    // Sort by match date (oldest first to show chronological order)
    results.sort((a, b) => new Date(a.match.startAt).getTime() - new Date(b.match.startAt).getTime());
    
    return results;
  }

  function updateScore(matchId: string, field: 'team1Score' | 'team2Score', value: string) {
    // Only allow positive integers
    if (value === "" || (/^\d+$/.test(value) && parseInt(value) >= 0)) {
      setScores(prev => ({
        ...prev,
        [matchId]: {
          ...prev[matchId],
          [field]: value
        }
      }));
    }
  }

  async function saveScores() {
    setSaving(true);
    try {
      const scoresToSave = Object.entries(scores)
        .filter(([_, scoreData]) => scoreData.team1Score !== "" && scoreData.team2Score !== "")
        .map(([matchId, scoreData]) => ({
          matchId,
          team1Score: parseInt(scoreData.team1Score),
          team2Score: parseInt(scoreData.team2Score)
        }));

      if (scoresToSave.length === 0) {
        setSaveMsg("No scores to save");
        setTimeout(() => setSaveMsg(""), 2000);
        return;
      }

      const response = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores: scoresToSave }),
      });

      if (response.ok) {
        setSaveMsg(`Saved ${scoresToSave.length} score(s)!`);
        await loadTeamsAndMatches();
        setTimeout(() => setSaveMsg(""), 2000);
      } else {
        const error = await response.json();
        setSaveMsg(error.error || "Failed to save scores");
        setTimeout(() => setSaveMsg(""), 3000);
      }
    } catch (error) {
      setSaveMsg("Network error");
      setTimeout(() => setSaveMsg(""), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function cancelMatch(matchId: string) {
    if (!window.confirm("Are you sure you want to cancel this match?")) {
      return;
    }

    try {
      const response = await fetch('/api/matches/cancel', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId }),
      });

      if (response.ok) {
        setSaveMsg("Match cancelled successfully!");
        await loadTeamsAndMatches();
        setTimeout(() => setSaveMsg(""), 3000);
      } else {
        const error = await response.json();
        setSaveMsg(error.error || "Failed to cancel match");
        setTimeout(() => setSaveMsg(""), 3000);
      }
    } catch (error) {
      setSaveMsg("Network error");
      setTimeout(() => setSaveMsg(""), 3000);
    }
  }

  async function scheduleMatch() {
    if (!showScheduleModal || !scheduleDate || !scheduleHour || !scheduleMinute) {
      setSaveMsg("Please select date, hour, and minute");
      setTimeout(() => setSaveMsg(""), 2000);
      return;
    }

    // Validate hour range (6am to 9pm = 6 to 21 in 24-hour format)
    const hour = parseInt(scheduleHour);
    if (hour < 6 || hour > 21) {
      setSaveMsg("Hour must be between 6am and 9pm");
      setTimeout(() => setSaveMsg(""), 2000);
      return;
    }

    // Validate minute values
    if (scheduleMinute !== "00" && scheduleMinute !== "30") {
      setSaveMsg("Minutes must be 00 or 30");
      setTimeout(() => setSaveMsg(""), 2000);
      return;
    }

    try {
      const timeString = `${scheduleHour.padStart(2, '0')}:${scheduleMinute}`;
      const matchDateTime = new Date(`${scheduleDate}T${timeString}:00.000Z`);
      
      // First, confirm the match
      const response = await fetch('/api/matches/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotKey: matchDateTime.toISOString(),
          opponentTeamId: showScheduleModal.team2Id
        }),
      });

      if (response.ok) {
        // Now add availability for both teams at this time slot
        const team1 = teamsData.teams.find(t => t.id === showScheduleModal.team1Id);
        const team2 = teamsData.teams.find(t => t.id === showScheduleModal.team2Id);
        
        const availabilityPromises = [];
        
        // Add availability for team 1 members
        if (team1) {
          if (team1.member1) {
            availabilityPromises.push(
              fetch('/api/availability/proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  weekStartISO: startOfWeekMonday(matchDateTime).toISOString(),
                  availableSlots: [matchDateTime.toISOString()],
                  unavailableSlots: [],
                  targetUserId: team1.member1.id,
                }),
              })
            );
          }
          if (team1.member2 && team1.member2.id !== team1.member1.id) {
            availabilityPromises.push(
              fetch('/api/availability/proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  weekStartISO: startOfWeekMonday(matchDateTime).toISOString(),
                  availableSlots: [matchDateTime.toISOString()],
                  unavailableSlots: [],
                  targetUserId: team1.member2.id,
                }),
              })
            );
          }
        }
        
        // Add availability for team 2 members
        if (team2) {
          if (team2.member1) {
            availabilityPromises.push(
              fetch('/api/availability/proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  weekStartISO: startOfWeekMonday(matchDateTime).toISOString(),
                  availableSlots: [matchDateTime.toISOString()],
                  unavailableSlots: [],
                  targetUserId: team2.member1.id,
                }),
              })
            );
          }
          if (team2.member2 && team2.member2.id !== team2.member1.id) {
            availabilityPromises.push(
              fetch('/api/availability/proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  weekStartISO: startOfWeekMonday(matchDateTime).toISOString(),
                  availableSlots: [matchDateTime.toISOString()],
                  unavailableSlots: [],
                  targetUserId: team2.member2.id,
                }),
              })
            );
          }
        }
        
        // Wait for all availability updates to complete
        await Promise.all(availabilityPromises);
        
        setSaveMsg("Match scheduled and added to calendars!");
        setShowScheduleModal(null);
        setScheduleDate("");
        setScheduleHour("");
        setScheduleMinute("");
        await loadTeamsAndMatches();
        setTimeout(() => setSaveMsg(""), 3000);
      } else {
        const error = await response.json();
        setSaveMsg(error.error || "Failed to schedule match");
        setTimeout(() => setSaveMsg(""), 3000);
      }
    } catch (error) {
      setSaveMsg("Network error");
      setTimeout(() => setSaveMsg(""), 3000);
    }
  }

  if (!session) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <Card>
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-semibold mb-4">Please log in</h2>
            <p className="text-muted-foreground mb-4">You need to be logged in to access scoring.</p>
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

  const teams = teamsData.teams || [];

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-semibold">Match Scoring</h1>
            <div className="flex items-center gap-4">
              {ladderInfo.allLadders.length > 1 && (
                <div className="flex items-center gap-2">
                  <label htmlFor="ladder-select" className="text-sm font-medium">
                    View Ladder:
                  </label>
                  <select
                    id="ladder-select"
                    value={selectedLadderId}
                    onChange={(e) => setSelectedLadderId(e.target.value)}
                    className="text-sm border rounded px-2 py-1"
                  >
                    {ladderInfo.allLadders.map(ladder => (
                      <option key={ladder.id} value={ladder.id}>
                        {ladder.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="text-sm text-muted-foreground">
                All matches across all weeks
              </div>
            </div>
          </div>

          {teams.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No teams found.
            </div>
          ) : (
            <>
              {/* Scoring Grid */}
              <div className="overflow-auto rounded-lg border">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-3 text-left font-medium">Team</th>
                      {teams.map(team => (
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
                    {teams.map(rowTeam => (
                      <tr key={rowTeam.id} className="border-b">
                        <td className="p-3 font-medium">
                          <div 
                            className="text-sm px-3 py-2 rounded text-white"
                            style={{ backgroundColor: rowTeam.color }}
                          >
                            {getTeamDisplayName(rowTeam)}
                          </div>
                        </td>
                        {teams.map(colTeam => {
                          if (rowTeam.id === colTeam.id) {
                            return (
                              <td key={colTeam.id} className="p-2 bg-gray-100">
                                <div className="text-center text-gray-400 text-sm">—</div>
                              </td>
                            );
                          }

                          const match = getMatchBetweenTeams(rowTeam.id, colTeam.id);
                          const isRowTeamFirst = match && match.team1Id === rowTeam.id;
                          
                          if (!match) {
                            // Only show schedule button if this involves my team
                            const isMyTeamMatch = rowTeam.id === teamsData.myTeamId || colTeam.id === teamsData.myTeamId;
                            
                            return (
                              <td key={colTeam.id} className="p-2 text-center">
                                <div className="text-gray-400 text-xs mb-1">No match</div>
                                {isMyTeamMatch && (
                                  <button
                                    onClick={() => setShowScheduleModal({team1Id: rowTeam.id, team2Id: colTeam.id})}
                                    className="text-xs bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded"
                                  >
                                    Schedule
                                  </button>
                                )}
                              </td>
                            );
                          }

                          const scoreData = scores[match.id] || { team1Score: "", team2Score: "" };
                          const rowTeamScore = isRowTeamFirst ? scoreData.team1Score : scoreData.team2Score;
                          const colTeamScore = isRowTeamFirst ? scoreData.team2Score : scoreData.team1Score;

                          return (
                            <td key={colTeam.id} className="p-2">
                              <div className="flex items-center justify-center gap-1 text-sm">
                                <Input
                                  type="text"
                                  value={rowTeamScore}
                                  onChange={(e) => updateScore(
                                    match.id, 
                                    isRowTeamFirst ? 'team1Score' : 'team2Score', 
                                    e.target.value
                                  )}
                                  className="w-12 h-8 text-center text-xs"
                                  placeholder="0"
                                />
                                <span className="text-gray-400">:</span>
                                <Input
                                  type="text"
                                  value={colTeamScore}
                                  onChange={(e) => updateScore(
                                    match.id, 
                                    isRowTeamFirst ? 'team2Score' : 'team1Score', 
                                    e.target.value
                                  )}
                                  className="w-12 h-8 text-center text-xs"
                                  placeholder="0"
                                />
                              </div>
                              <div className="text-xs text-center mt-1 text-gray-500">
                                {new Date(match.startAt).toLocaleDateString()}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    
                    {/* Wins/Losses Row */}
                    <tr className="border-t-2 border-gray-300 bg-gray-50">
                      <td className="p-3 font-semibold text-sm">
                        Win/Loss Record
                      </td>
                      {teams.map(team => {
                        const results = getTeamResults(team.id);
                        return (
                          <td key={team.id} className="p-2 text-center">
                            <div className="flex flex-wrap items-center justify-center gap-1 min-h-[40px]">
                              {results.map((result, index) => (
                                <div
                                  key={`${result.match.id}-${index}`}
                                  className={`w-3 h-3 rounded-full ${result.won ? 'bg-green-500' : 'bg-red-500'}`}
                                  title={`${result.won ? 'Won' : 'Lost'} vs ${getTeamDisplayName(result.opponent)} on ${new Date(result.match.startAt).toLocaleDateString()}`}
                                />
                              ))}
                              {results.length === 0 && (
                                <span className="text-gray-400 text-xs">No games</span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {results.filter(r => r.won).length}W-{results.filter(r => !r.won).length}L
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Match Summary */}
              <div className="mt-6 space-y-6">
                {(() => {
                  const now = new Date();
                  const upcomingMatches = teamsData.matches?.filter(match => 
                    new Date(match.startAt) > now && !match.completed
                  ) || [];
                  const pastUncompletedMatches = teamsData.matches?.filter(match => 
                    new Date(match.startAt) <= now && !match.completed
                  ) || [];
                  const playedMatches = teamsData.matches?.filter(match => 
                    match.completed
                  ) || [];
                  
                  return (
                    <>
                      {/* Upcoming Matches */}
                      <div>
                        <h3 className="text-lg font-semibold mb-3">Upcoming Matches ({upcomingMatches.length})</h3>
                        <div className="grid gap-3">
                          {upcomingMatches.map(match => {
                            const team1 = teams.find(t => t.id === match.team1Id);
                            const team2 = teams.find(t => t.id === match.team2Id);
                            const scoreData = scores[match.id];
                            const hasScore = scoreData?.team1Score !== "" && scoreData?.team2Score !== "";
                            
                            return (
                              <div key={match.id} className="flex items-center justify-between p-3 border rounded-lg bg-blue-50">
                                <div className="flex items-center gap-3">
                                  <div 
                                    className="w-3 h-3 rounded"
                                    style={{ backgroundColor: team1?.color }}
                                  />
                                  <span className="text-sm font-medium">
                                    {team1 ? getTeamDisplayName(team1) : 'Unknown'}
                                  </span>
                                  <span className="text-gray-400">vs</span>
                                  <div 
                                    className="w-3 h-3 rounded"
                                    style={{ backgroundColor: team2?.color }}
                                  />
                                  <span className="text-sm font-medium">
                                    {team2 ? getTeamDisplayName(team2) : 'Unknown'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 text-sm">
                                  <span className="text-gray-500">
                                    {new Date(match.startAt).toLocaleDateString()} at {new Date(match.startAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                                  </span>
                                  {hasScore && (
                                    <span className="font-mono bg-muted px-2 py-1 rounded">
                                      {scoreData.team1Score}:{scoreData.team2Score}
                                    </span>
                                  )}
                                  <span className="text-blue-600 text-xs">📅 Scheduled</span>
                                  {(() => {
                                    const isMyMatch = teamsData.myTeamId && (match.team1Id === teamsData.myTeamId || match.team2Id === teamsData.myTeamId);
                                    return isMyMatch && (
                                      <button
                                        onClick={() => cancelMatch(match.id)}
                                        className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                                      >
                                        Cancel
                                      </button>
                                    );
                                  })()}
                                </div>
                              </div>
                            );
                          })}
                          {upcomingMatches.length === 0 && (
                            <div className="text-center py-4 text-gray-500">No upcoming matches</div>
                          )}
                        </div>
                      </div>

                      {/* Past Uncompleted Matches (Missed) */}
                      {pastUncompletedMatches.length > 0 && (
                        <div>
                          <h3 className="text-lg font-semibold mb-3">Missed Matches ({pastUncompletedMatches.length})</h3>
                          <div className="grid gap-3">
                            {pastUncompletedMatches.map(match => {
                              const team1 = teams.find(t => t.id === match.team1Id);
                              const team2 = teams.find(t => t.id === match.team2Id);
                              const isMyMatch = teamsData.myTeamId && (match.team1Id === teamsData.myTeamId || match.team2Id === teamsData.myTeamId);
                              
                              return (
                                <div key={match.id} className="flex items-center justify-between p-3 border rounded-lg bg-yellow-50">
                                  <div className="flex items-center gap-3">
                                    <div 
                                      className="w-3 h-3 rounded"
                                      style={{ backgroundColor: team1?.color }}
                                    />
                                    <span className="text-sm font-medium">
                                      {team1 ? getTeamDisplayName(team1) : 'Unknown'}
                                    </span>
                                    <span className="text-gray-400">vs</span>
                                    <div 
                                      className="w-3 h-3 rounded"
                                      style={{ backgroundColor: team2?.color }}
                                    />
                                    <span className="text-sm font-medium">
                                      {team2 ? getTeamDisplayName(team2) : 'Unknown'}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3 text-sm">
                                    <span className="text-gray-500">
                                      {new Date(match.startAt).toLocaleDateString()} at {new Date(match.startAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                                    </span>
                                    <span className="text-yellow-600 text-xs">⚠️ Missed</span>
                                    {isMyMatch && (
                                      <button
                                        onClick={() => cancelMatch(match.id)}
                                        className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                                      >
                                        Cancel
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Played Matches */}
                      <div>
                        <h3 className="text-lg font-semibold mb-3">Played Matches ({playedMatches.length})</h3>
                        <div className="grid gap-3">
                          {playedMatches.map(match => {
                            const team1 = teams.find(t => t.id === match.team1Id);
                            const team2 = teams.find(t => t.id === match.team2Id);
                            const scoreData = scores[match.id];
                            const hasScore = scoreData?.team1Score !== "" && scoreData?.team2Score !== "";
                            
                            return (
                              <div key={match.id} className="flex items-center justify-between p-3 border rounded-lg bg-green-50">
                                <div className="flex items-center gap-3">
                                  <div 
                                    className="w-3 h-3 rounded"
                                    style={{ backgroundColor: team1?.color }}
                                  />
                                  <span className="text-sm font-medium">
                                    {team1 ? getTeamDisplayName(team1) : 'Unknown'}
                                  </span>
                                  <span className="text-gray-400">vs</span>
                                  <div 
                                    className="w-3 h-3 rounded"
                                    style={{ backgroundColor: team2?.color }}
                                  />
                                  <span className="text-sm font-medium">
                                    {team2 ? getTeamDisplayName(team2) : 'Unknown'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 text-sm">
                                  <span className="text-gray-500">
                                    {new Date(match.startAt).toLocaleDateString()} at {new Date(match.startAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                                  </span>
                                  {hasScore && (
                                    <span className="font-mono bg-muted px-2 py-1 rounded">
                                      {scoreData.team1Score}:{scoreData.team2Score}
                                    </span>
                                  )}
                                  <span className="text-green-600 text-xs">✓ Complete</span>
                                </div>
                              </div>
                            );
                          })}
                          {playedMatches.length === 0 && (
                            <div className="text-center py-4 text-gray-500">No played matches</div>
                          )}
                        </div>
                      </div>

                      {/* All Completed Matches */}
                      <div>
                        <h3 className="text-lg font-semibold mb-3">All Completed Matches ({teamsData.matches?.filter(m => m.completed).length || 0})</h3>
                        <div className="grid gap-3">
                          {teamsData.matches?.filter(match => match.completed).map(match => {
                            const team1 = teams.find(t => t.id === match.team1Id);
                            const team2 = teams.find(t => t.id === match.team2Id);
                            const scoreData = scores[match.id];
                            const hasScore = scoreData?.team1Score !== "" && scoreData?.team2Score !== "";
                            
                            return (
                              <div key={match.id} className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                                <div className="flex items-center gap-3">
                                  <div 
                                    className="w-3 h-3 rounded"
                                    style={{ backgroundColor: team1?.color }}
                                  />
                                  <span className="text-sm font-medium">
                                    {team1 ? getTeamDisplayName(team1) : 'Unknown'}
                                  </span>
                                  <span className="text-gray-400">vs</span>
                                  <div 
                                    className="w-3 h-3 rounded"
                                    style={{ backgroundColor: team2?.color }}
                                  />
                                  <span className="text-sm font-medium">
                                    {team2 ? getTeamDisplayName(team2) : 'Unknown'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 text-sm">
                                  <span className="text-gray-500">
                                    {new Date(match.startAt).toLocaleDateString()} at {new Date(match.startAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                                  </span>
                                  {hasScore && (
                                    <span className="font-mono bg-muted px-2 py-1 rounded">
                                      {scoreData.team1Score}:{scoreData.team2Score}
                                    </span>
                                  )}
                                  <span className="text-green-600 text-xs">✓ Complete</span>
                                </div>
                              </div>
                            );
                          })}
                          {teamsData.matches?.filter(m => m.completed).length === 0 && (
                            <div className="text-center py-4 text-gray-500">No completed matches</div>
                          )}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-center">
        <div className="flex items-center gap-4">
          {saveMsg && (
            <span className="text-sm text-muted-foreground">{saveMsg}</span>
          )}
          <Button onClick={saveScores} disabled={saving} size="lg">
            {saving ? "Saving..." : "Save Scores"}
          </Button>
          <Button onClick={loadTeamsAndMatches} variant="outline" size="lg">
            🔄 Refresh Data
          </Button>
        </div>
      </div>

      {/* Schedule Match Popup */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50">
          <div 
            className="absolute inset-0" 
            onClick={() => {
              setShowScheduleModal(null);
              setScheduleDate("");
              setScheduleHour("");
              setScheduleMinute("");
            }}
          />
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg border p-4 w-80">
            <h3 className="text-base font-semibold mb-3">Schedule Match</h3>
            <p className="text-xs text-gray-600 mb-3">
              Between{" "}
              <span className="font-medium">
                {getTeamDisplayName(teams.find(t => t.id === showScheduleModal.team1Id)!)}
              </span>{" "}
              vs{" "}
              <span className="font-medium">
                {getTeamDisplayName(teams.find(t => t.id === showScheduleModal.team2Id)!)}
              </span>
            </p>
            
            <div className="space-y-2 mb-3">
              <div>
                <label className="block text-xs font-medium mb-1">Date</label>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full p-1.5 text-sm border rounded"
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium mb-1">Hour</label>
                  <input
                    type="number"
                    min="6"
                    max="21"
                    value={scheduleHour}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === "" || (parseInt(value) >= 6 && parseInt(value) <= 21)) {
                        setScheduleHour(value);
                      }
                    }}
                    className="w-full p-1.5 text-sm border rounded text-center"
                    placeholder="6-21"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Minutes</label>
                  <select
                    value={scheduleMinute}
                    onChange={(e) => setScheduleMinute(e.target.value)}
                    className="w-full p-1.5 text-sm border rounded"
                  >
                    <option value="">Select</option>
                    <option value="00">00</option>
                    <option value="30">30</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowScheduleModal(null);
                  setScheduleDate("");
                  setScheduleHour("");
                  setScheduleMinute("");
                }}
                className="px-3 py-1.5 text-xs text-gray-600 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={scheduleMatch}
                className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}