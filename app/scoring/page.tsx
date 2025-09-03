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
  team1DetailedScore?: string;
  team2DetailedScore?: string;
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
  const [unsavedMatches, setUnsavedMatches] = useState<Set<string>>(new Set());
  const [savingMatch, setSavingMatch] = useState<string | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState<{team1Id: string; team2Id: string} | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleHour, setScheduleHour] = useState("18"); // Default to 6pm (18 in 24-hour format)
  const [scheduleMinute, setScheduleMinute] = useState("00"); // Default to 00 minutes
  const [selectedLadderId, setSelectedLadderId] = useState<string>("");
  const [ladderInfo, setLadderInfo] = useState<{
    currentLadder?: { id: string; name: string; number: number; endDate: string; matchFormat?: any };
    allLadders: Array<{ id: string; name: string; number: number; endDate: string; matchFormat?: any }>;
  }>({ allLadders: [] });
  const [showFormatModal, setShowFormatModal] = useState(false);
  const [matchFormat, setMatchFormat] = useState({
    sets: 3,
    gamesPerSet: 6,
    winnerBy: 'sets' as 'sets' | 'games',
    decidingSetType: 'normal' as 'normal' | 'ctb'
  });
  const [showEditScoreModal, setShowEditScoreModal] = useState<{
    matchId: string;
    team1Name: string;
    team2Name: string;
    team1Color: string;
    team2Color: string;
  } | null>(null);
  const [editingScores, setEditingScores] = useState<{
    team1Score: string;
    team2Score: string;
  }>({ team1Score: "", team2Score: "" });

  useEffect(() => {
    if (session) {
      loadLadderInfo();
    }
  }, [session]);

  useEffect(() => {
    if (session && selectedLadderId) {
      loadTeamsAndMatches();
      // Update match format when ladder changes
      const selectedLadder = ladderInfo.allLadders.find(ladder => ladder.id === selectedLadderId);
      if (selectedLadder?.matchFormat) {
        setMatchFormat(selectedLadder.matchFormat);
      }
    }
  }, [session, selectedLadderId, ladderInfo.allLadders]);

  async function loadLadderInfo() {
    try {
      const response = await fetch('/api/ladders');
      if (response.ok) {
        const data = await response.json();
        setLadderInfo(data);
        // Set current ladder as default selection
        if (data.currentLadder) {
          setSelectedLadderId(data.currentLadder.id);
          // Load match format from current ladder if available
          if (data.currentLadder.matchFormat) {
            setMatchFormat(data.currentLadder.matchFormat);
          }
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
            team1Score: match.team1DetailedScore || match.team1Score?.toString() || "",
            team2Score: match.team2DetailedScore || match.team2Score?.toString() || ""
          };
        });
        setScores(initialScores);
        // Clear unsaved matches since we just loaded from server
        setUnsavedMatches(new Set());
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

  function getSetScore(scoreString: string, setIndex: number): string {
    if (!scoreString) return "";
    const sets = scoreString.split(',');
    return sets[setIndex] || "";
  }

  function updateSetScore(matchId: string, field: 'team1Score' | 'team2Score', setIndex: number, value: string) {
    // Allow positive integers or 'X' for unplayed sets
    if (value !== "" && value !== "X" && (!/^\d+$/.test(value) || parseInt(value) < 0)) {
      return;
    }
    
    setScores(prev => {
      const currentScore = prev[matchId]?.[field] || "";
      const sets = currentScore.split(',');
      
      // Ensure we have enough set slots
      while (sets.length < matchFormat.sets) {
        sets.push("");
      }
      
      sets[setIndex] = value;
      
      return {
        ...prev,
        [matchId]: {
          ...prev[matchId],
          [field]: sets.join(',')
        }
      };
    });
    
    // Mark this match as having unsaved changes
    setUnsavedMatches(prev => new Set(prev).add(matchId));
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
      
      // Mark this match as having unsaved changes
      setUnsavedMatches(prev => new Set(prev).add(matchId));
    }
  }

  async function saveIndividualScore(matchId: string) {
    setSavingMatch(matchId);
    try {
      const scoreData = scores[matchId];
      if (!scoreData) return;

      // Check if we have valid scores to save
      const hasValidScore = scoreData.team1Score !== "" && scoreData.team2Score !== "";
      const hasValidSetScore = (scoreData.team1Score.includes(',') || scoreData.team2Score.includes(',')) &&
        scoreData.team1Score.split(',').some(s => s !== "" && s !== "X") && 
        scoreData.team2Score.split(',').some(s => s !== "" && s !== "X");
      
      if (!hasValidScore && !hasValidSetScore) {
        setSaveMsg("Please enter valid scores");
        setTimeout(() => setSaveMsg(""), 2000);
        return;
      }

      let finalTeam1Score: string | number;
      let finalTeam2Score: string | number;
      let detailedTeam1Score: string | undefined = undefined;
      let detailedTeam2Score: string | undefined = undefined;
      
      if (scoreData.team1Score.includes(',') || scoreData.team2Score.includes(',')) {
        // Set-based scoring - preserve the format and auto-fill X for decided matches
        const calculated = calculateFinalScores(scoreData.team1Score, scoreData.team2Score);
        
        // Store detailed scores
        detailedTeam1Score = calculated.team1Score;
        detailedTeam2Score = calculated.team2Score;
        
        // Update the scores state with X markers
        setScores(prev => ({
          ...prev,
          [matchId]: {
            team1Score: calculated.team1Score,
            team2Score: calculated.team2Score
          }
        }));
        
        if (matchFormat.winnerBy === 'sets') {
          // Store sets won as final score
          finalTeam1Score = calculated.team1SetsWon;
          finalTeam2Score = calculated.team2SetsWon;
        } else {
          // Store total games as final score
          const team1Games = calculated.team1Score.split(',')
            .filter(s => s !== 'X' && s !== '')
            .reduce((sum, games) => sum + (parseInt(games) || 0), 0);
          const team2Games = calculated.team2Score.split(',')
            .filter(s => s !== 'X' && s !== '')
            .reduce((sum, games) => sum + (parseInt(games) || 0), 0);
          finalTeam1Score = team1Games;
          finalTeam2Score = team2Games;
        }
      } else {
        // Single score format
        finalTeam1Score = parseInt(scoreData.team1Score) || 0;
        finalTeam2Score = parseInt(scoreData.team2Score) || 0;
      }

      const scoreToSave = {
        matchId,
        team1Score: finalTeam1Score,
        team2Score: finalTeam2Score,
        team1DetailedScore: detailedTeam1Score,
        team2DetailedScore: detailedTeam2Score
      };

      const response = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores: [scoreToSave] }),
      });

      if (response.ok) {
        setSaveMsg("Score saved!");
        // Remove from unsaved matches
        setUnsavedMatches(prev => {
          const newSet = new Set(prev);
          newSet.delete(matchId);
          return newSet;
        });
        setTimeout(() => setSaveMsg(""), 2000);
      } else {
        const error = await response.json();
        setSaveMsg(error.error || "Failed to save score");
        setTimeout(() => setSaveMsg(""), 3000);
      }
    } catch (error) {
      setSaveMsg("Network error");
      setTimeout(() => setSaveMsg(""), 3000);
    } finally {
      setSavingMatch(null);
    }
  }

  function calculateFinalScores(team1ScoreString: string, team2ScoreString: string) {
    // Auto-fill 'X' for unplayed sets if match is already decided
    const team1Sets = team1ScoreString.split(',').map(s => s.trim());
    const team2Sets = team2ScoreString.split(',').map(s => s.trim());
    
    // Count sets won so far
    let team1SetsWon = 0;
    let team2SetsWon = 0;
    let playedSets = 0;
    
    for (let i = 0; i < Math.max(team1Sets.length, team2Sets.length); i++) {
      const t1Games = team1Sets[i];
      const t2Games = team2Sets[i];
      
      if (t1Games && t2Games && t1Games !== "" && t2Games !== "") {
        playedSets++;
        const t1Score = parseInt(t1Games) || 0;
        const t2Score = parseInt(t2Games) || 0;
        if (t1Score > t2Score) team1SetsWon++;
        else if (t2Score > t1Score) team2SetsWon++;
      }
    }
    
    // Check if match is decided (someone has majority of sets)
    const setsToWin = Math.ceil(matchFormat.sets / 2);
    const matchDecided = team1SetsWon >= setsToWin || team2SetsWon >= setsToWin;
    
    // Fill remaining sets with 'X' if match is decided
    if (matchDecided) {
      while (team1Sets.length < matchFormat.sets) team1Sets.push('X');
      while (team2Sets.length < matchFormat.sets) team2Sets.push('X');
      
      for (let i = playedSets; i < matchFormat.sets; i++) {
        if (team1Sets[i] === "" || team1Sets[i] === undefined) team1Sets[i] = 'X';
        if (team2Sets[i] === "" || team2Sets[i] === undefined) team2Sets[i] = 'X';
      }
    }
    
    return {
      team1Score: team1Sets.join(','),
      team2Score: team2Sets.join(','),
      team1SetsWon,
      team2SetsWon
    };
  }

  async function saveScores() {
    setSaving(true);
    try {
      const scoresToSave = Object.entries(scores)
        .filter(([_, scoreData]) => {
          // For set-based scoring, check if at least one set is complete for both teams
          if (scoreData.team1Score.includes(',') || scoreData.team2Score.includes(',')) {
            const team1Sets = scoreData.team1Score.split(',');
            const team2Sets = scoreData.team2Score.split(',');
            return team1Sets.some(s => s !== "" && s !== "X") && team2Sets.some(s => s !== "" && s !== "X");
          }
          // For single score, require both scores
          return scoreData.team1Score !== "" && scoreData.team2Score !== "";
        })
        .map(([matchId, scoreData]) => {
          let finalTeam1Score: string | number;
          let finalTeam2Score: string | number;
          let detailedTeam1Score: string | undefined = undefined;
          let detailedTeam2Score: string | undefined = undefined;
          
          if (scoreData.team1Score.includes(',') || scoreData.team2Score.includes(',')) {
            // Set-based scoring - preserve the format and auto-fill X for decided matches
            const calculated = calculateFinalScores(scoreData.team1Score, scoreData.team2Score);
            
            // Store detailed scores
            detailedTeam1Score = calculated.team1Score;
            detailedTeam2Score = calculated.team2Score;
            
            // Update the scores state with X markers
            setScores(prev => ({
              ...prev,
              [matchId]: {
                team1Score: calculated.team1Score,
                team2Score: calculated.team2Score
              }
            }));
            
            if (matchFormat.winnerBy === 'sets') {
              // Store sets won as final score
              finalTeam1Score = calculated.team1SetsWon;
              finalTeam2Score = calculated.team2SetsWon;
            } else {
              // Store total games as final score
              const team1Games = calculated.team1Score.split(',')
                .filter(s => s !== 'X' && s !== '')
                .reduce((sum, games) => sum + (parseInt(games) || 0), 0);
              const team2Games = calculated.team2Score.split(',')
                .filter(s => s !== 'X' && s !== '')
                .reduce((sum, games) => sum + (parseInt(games) || 0), 0);
              finalTeam1Score = team1Games;
              finalTeam2Score = team2Games;
            }
          } else {
            // Single score format
            finalTeam1Score = parseInt(scoreData.team1Score) || 0;
            finalTeam2Score = parseInt(scoreData.team2Score) || 0;
          }
          
          return {
            matchId,
            team1Score: finalTeam1Score,
            team2Score: finalTeam2Score,
            team1DetailedScore: detailedTeam1Score,
            team2DetailedScore: detailedTeam2Score
          };
        });

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

  function openEditScoreModal(matchId: string, displayTeam1: Team, displayTeam2: Team) {
    const match = teamsData.matches.find(m => m.id === matchId);
    if (!match) return;
    
    // Get the actual teams based on match.team1Id and match.team2Id (database order)
    const actualTeam1 = teams.find(t => t.id === match.team1Id);
    const actualTeam2 = teams.find(t => t.id === match.team2Id);
    
    if (!actualTeam1 || !actualTeam2) return;
    
    const currentScores = scores[matchId] || { team1Score: "", team2Score: "" };
    setEditingScores({
      team1Score: currentScores.team1Score,
      team2Score: currentScores.team2Score
    });
    setShowEditScoreModal({
      matchId,
      team1Name: getTeamDisplayName(actualTeam1),
      team2Name: getTeamDisplayName(actualTeam2),
      team1Color: actualTeam1.color,
      team2Color: actualTeam2.color
    });
  }

  function updateEditingSetScore(field: 'team1Score' | 'team2Score', setIndex: number, value: string) {
    setEditingScores(prev => {
      const currentScore = prev[field] || "";
      const sets = currentScore.split(',');
      
      // Ensure we have enough set slots
      while (sets.length < matchFormat.sets) {
        sets.push("");
      }
      
      sets[setIndex] = value;
      
      return {
        ...prev,
        [field]: sets.join(',')
      };
    });
  }

  function getEditingSetScore(scoreString: string, setIndex: number): string {
    if (!scoreString) return "";
    const sets = scoreString.split(',');
    return sets[setIndex] || "";
  }

  async function saveEditedScores() {
    if (!showEditScoreModal) return;

    try {
      const scoreData = editingScores;
      const matchId = showEditScoreModal.matchId;

      // Check if we have valid scores to save
      const hasValidScore = scoreData.team1Score !== "" && scoreData.team2Score !== "";
      const hasValidSetScore = (scoreData.team1Score.includes(',') || scoreData.team2Score.includes(',')) &&
        scoreData.team1Score.split(',').some(s => s !== "" && s !== "X") && 
        scoreData.team2Score.split(',').some(s => s !== "" && s !== "X");
      
      if (!hasValidScore && !hasValidSetScore) {
        setSaveMsg("Please enter valid scores");
        setTimeout(() => setSaveMsg(""), 2000);
        return;
      }

      let finalTeam1Score: string | number;
      let finalTeam2Score: string | number;
      let detailedTeam1Score: string | undefined = undefined;
      let detailedTeam2Score: string | undefined = undefined;
      
      if (scoreData.team1Score.includes(',') || scoreData.team2Score.includes(',')) {
        // Set-based scoring - preserve the format and auto-fill X for decided matches
        const calculated = calculateFinalScores(scoreData.team1Score, scoreData.team2Score);
        
        // Store detailed scores
        detailedTeam1Score = calculated.team1Score;
        detailedTeam2Score = calculated.team2Score;
        
        if (matchFormat.winnerBy === 'sets') {
          // Store sets won as final score
          finalTeam1Score = calculated.team1SetsWon;
          finalTeam2Score = calculated.team2SetsWon;
        } else {
          // Store total games as final score
          const team1Games = calculated.team1Score.split(',')
            .filter(s => s !== 'X' && s !== '')
            .reduce((sum, games) => sum + (parseInt(games) || 0), 0);
          const team2Games = calculated.team2Score.split(',')
            .filter(s => s !== 'X' && s !== '')
            .reduce((sum, games) => sum + (parseInt(games) || 0), 0);
          finalTeam1Score = team1Games;
          finalTeam2Score = team2Games;
        }
      } else {
        // Single score format
        finalTeam1Score = parseInt(scoreData.team1Score) || 0;
        finalTeam2Score = parseInt(scoreData.team2Score) || 0;
      }

      const scoreToSave = {
        matchId,
        team1Score: finalTeam1Score,
        team2Score: finalTeam2Score,
        team1DetailedScore: detailedTeam1Score,
        team2DetailedScore: detailedTeam2Score
      };

      const response = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores: [scoreToSave] }),
      });

      if (response.ok) {
        // Update the main scores state with the edited values
        setScores(prev => ({
          ...prev,
          [matchId]: {
            team1Score: detailedTeam1Score || scoreData.team1Score,
            team2Score: detailedTeam2Score || scoreData.team2Score
          }
        }));

        // Remove from unsaved matches since we just saved
        setUnsavedMatches(prev => {
          const newSet = new Set(prev);
          newSet.delete(matchId);
          return newSet;
        });

        setSaveMsg("Score saved!");
        setTimeout(() => setSaveMsg(""), 2000);

        // Close modal
        setShowEditScoreModal(null);
        setEditingScores({ team1Score: "", team2Score: "" });

        // Optionally reload data to ensure consistency
        await loadTeamsAndMatches();
      } else {
        const error = await response.json();
        setSaveMsg(error.error || "Failed to save score");
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
      
      // Determine which team is the opponent (not the current user's team)
      const opponentTeamId = showScheduleModal.team1Id === teamsData.myTeamId 
        ? showScheduleModal.team2Id 
        : showScheduleModal.team1Id;
      
      // First, confirm the match
      const response = await fetch('/api/matches/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotKey: matchDateTime.toISOString(),
          opponentTeamId: opponentTeamId
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
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-semibold">Match Scoring</h1>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowFormatModal(true)}
                className="text-xs"
              >
                Change Format
              </Button>
            </div>
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
                              <div className="flex justify-center">
                                {/* Clickable scoring table */}
                                <div
                                  onClick={() => openEditScoreModal(match.id, rowTeam, colTeam)}
                                  className="cursor-pointer hover:bg-gray-50 rounded p-1 transition-colors"
                                  title="Click to edit scores"
                                >
                                  <table className="text-xs border-collapse">
                                    <thead>
                                      <tr>
                                        <th className="w-4"></th>
                                        {Array.from({ length: matchFormat.sets }, (_, setIndex) => (
                                          <th key={setIndex} className="text-center text-xs font-medium text-gray-600 px-1">
                                            S{setIndex + 1}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {/* Row team games */}
                                      <tr>
                                        <td className="pr-2 text-center">
                                          <div 
                                            className="w-2 h-2 rounded-full mx-auto"
                                            style={{ backgroundColor: rowTeam.color }}
                                          />
                                        </td>
                                        {Array.from({ length: matchFormat.sets }, (_, setIndex) => (
                                          <td key={setIndex}>
                                            <div className="w-9 h-5 text-center text-xs border rounded flex items-center justify-center bg-white">
                                              {getSetScore(rowTeamScore, setIndex) || '0'}
                                            </div>
                                          </td>
                                        ))}
                                      </tr>
                                      
                                      {/* Column team games */}
                                      <tr>
                                        <td className="pr-2 text-center">
                                          <div 
                                            className="w-2 h-2 rounded-full mx-auto"
                                            style={{ backgroundColor: colTeam.color }}
                                          />
                                        </td>
                                        {Array.from({ length: matchFormat.sets }, (_, setIndex) => (
                                          <td key={setIndex}>
                                            <div className="w-9 h-5 text-center text-xs border rounded flex items-center justify-center bg-white">
                                              {getSetScore(colTeamScore, setIndex) || '0'}
                                            </div>
                                          </td>
                                        ))}
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
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

              {/* Individual Save Score Buttons */}
              <div className="grid gap-2 mt-4">
                {Array.from(unsavedMatches).map(matchId => {
                  const match = teamsData.matches.find(m => m.id === matchId);
                  if (!match) return null;
                  
                  const team1 = teams.find(t => t.id === match.team1Id);
                  const team2 = teams.find(t => t.id === match.team2Id);
                  
                  return (
                    <div key={matchId} className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
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
                      <Button
                        onClick={() => saveIndividualScore(matchId)}
                        disabled={savingMatch === matchId}
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white text-sm"
                      >
                        {savingMatch === matchId ? "Saving..." : "Save Score"}
                      </Button>
                    </div>
                  );
                })}
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
                                    <span className="font-mono bg-muted px-2 py-1 rounded text-xs">
                                      {scoreData.team1Score.includes(',') 
                                        ? `${scoreData.team1Score} : ${scoreData.team2Score}` 
                                        : `${scoreData.team1Score}:${scoreData.team2Score}`}
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
                                    <span className="font-mono bg-muted px-2 py-1 rounded text-xs">
                                      {scoreData.team1Score.includes(',') 
                                        ? `${scoreData.team1Score} : ${scoreData.team2Score}` 
                                        : `${scoreData.team1Score}:${scoreData.team2Score}`}
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
                                    <span className="font-mono bg-muted px-2 py-1 rounded text-xs">
                                      {scoreData.team1Score.includes(',') 
                                        ? `${scoreData.team1Score} : ${scoreData.team2Score}` 
                                        : `${scoreData.team1Score}:${scoreData.team2Score}`}
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

      {/* Fixed Refresh Button */}
      <div className="fixed bottom-6 right-6 z-40">
        <Button 
          onClick={loadTeamsAndMatches} 
          variant="outline" 
          size="lg"
          className="shadow-lg border-2"
        >
          🔄 Refresh Data
        </Button>
      </div>

      {/* Save Message */}
      {saveMsg && (
        <div className="fixed bottom-20 right-6 z-40">
          <div className="bg-white border rounded-lg shadow-lg px-4 py-2 text-sm">
            {saveMsg}
          </div>
        </div>
      )}

      {/* Schedule Match Popup */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50">
          <div 
            className="absolute inset-0" 
            onClick={() => {
              setShowScheduleModal(null);
              setScheduleDate("");
              setScheduleHour("18");
              setScheduleMinute("00");
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
                  setScheduleHour("18");
                  setScheduleMinute("00");
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

      {/* Format Settings Modal */}
      {showFormatModal && (
        <div className="fixed inset-0 z-50">
          <div 
            className="absolute inset-0 bg-black bg-opacity-50" 
            onClick={() => setShowFormatModal(false)}
          />
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg border p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">Match Format Settings</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Number of Sets</label>
                <select
                  value={matchFormat.sets}
                  onChange={(e) => setMatchFormat(prev => ({ ...prev, sets: parseInt(e.target.value) }))}
                  className="w-full p-2 border rounded-lg"
                >
                  <option value={1}>1 Set</option>
                  <option value={3}>3 Sets (Best of 3)</option>
                  <option value={5}>5 Sets (Best of 5)</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Games per Set</label>
                <Input
                  type="number"
                  min="1"
                  max="20"
                  value={matchFormat.gamesPerSet}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    if (!isNaN(value) && value >= 1 && value <= 20) {
                      setMatchFormat(prev => ({ ...prev, gamesPerSet: value }));
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
                  value={matchFormat.winnerBy}
                  onChange={(e) => setMatchFormat(prev => ({ ...prev, winnerBy: e.target.value as 'sets' | 'games' }))}
                  className="w-full p-2 border rounded-lg"
                >
                  <option value="sets">Most Sets Won</option>
                  <option value="games">Most Games Won</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Deciding Set Type</label>
                <select
                  value={matchFormat.decidingSetType}
                  onChange={(e) => setMatchFormat(prev => ({ ...prev, decidingSetType: e.target.value as 'normal' | 'ctb' }))}
                  className="w-full p-2 border rounded-lg"
                >
                  <option value="normal">Normal Set</option>
                  <option value="ctb">Championship Tie-Break (First to 10, Win by 2)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Championship tie-break allows flexible scoring (any score ≥10 with win by 2)
                </p>
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                <div className="font-medium text-blue-900 mb-1">Current Format:</div>
                <div className="text-blue-800">
                  {matchFormat.sets === 1 ? '1 Set' : `Best of ${matchFormat.sets} Sets`} • {matchFormat.gamesPerSet} Games per Set
                  <br />
                  Winner: {matchFormat.winnerBy === 'sets' ? 'Most Sets' : 'Most Games'}
                  <br />
                  Deciding Set: {matchFormat.decidingSetType === 'ctb' ? 'Championship Tie-Break' : 'Normal Set'}
                </div>
              </div>
            </div>
            
            <div className="flex gap-3 justify-end mt-6">
              <Button
                variant="outline"
                onClick={() => setShowFormatModal(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  try {
                    const response = await fetch('/api/ladders/update-format', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        ladderId: selectedLadderId,
                        newMatchFormat: matchFormat
                      }),
                    });

                    if (response.ok) {
                      setShowFormatModal(false);
                      setSaveMsg("Format updated and saved to database!");
                      setTimeout(() => setSaveMsg(""), 3000);
                    } else {
                      const error = await response.json();
                      setSaveMsg(error.error || "Failed to update format");
                      setTimeout(() => setSaveMsg(""), 3000);
                    }
                  } catch (error) {
                    setSaveMsg("Network error updating format");
                    setTimeout(() => setSaveMsg(""), 3000);
                  }
                }}
              >
                Save Format
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Score Modal */}
      {showEditScoreModal && (
        <div className="fixed inset-0 z-50">
          <div 
            className="absolute inset-0 bg-black bg-opacity-50" 
            onClick={() => {
              setShowEditScoreModal(null);
              setEditingScores({ team1Score: "", team2Score: "" });
            }}
          />
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg border p-6 w-96 max-w-full">
            <h3 className="text-lg font-semibold mb-4">Edit Match Score</h3>
            <p className="text-sm text-gray-600 mb-4">
              <span 
                className="inline-block w-3 h-3 rounded-full mr-2"
                style={{ backgroundColor: showEditScoreModal.team1Color }}
              />
              {showEditScoreModal.team1Name}
              <span className="mx-2">vs</span>
              <span 
                className="inline-block w-3 h-3 rounded-full mr-2"
                style={{ backgroundColor: showEditScoreModal.team2Color }}
              />
              {showEditScoreModal.team2Name}
            </p>
            
            <div className="space-y-4">
              {Array.from({ length: matchFormat.sets }, (_, setIndex) => (
                <div key={setIndex} className="border rounded-lg p-3">
                  <div className="text-sm font-medium mb-2">Set {setIndex + 1}</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <div 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: showEditScoreModal.team1Color }}
                        />
                        <span className="text-sm font-medium">
                          {showEditScoreModal.team1Name.length > 20 
                            ? showEditScoreModal.team1Name.substring(0, 20) + '...'
                            : showEditScoreModal.team1Name}
                        </span>
                      </div>
                      <select
                        value={getEditingSetScore(editingScores.team1Score, setIndex)}
                        onChange={(e) => updateEditingSetScore('team1Score', setIndex, e.target.value)}
                        className="w-full p-2 border rounded-lg text-sm"
                      >
                        <option value="">-</option>
                        <option value="X">X (Not played)</option>
                        {(() => {
                          // For CTB, allow flexible scoring on potentially deciding sets
                          const isPotentialDecidingSet = matchFormat.decidingSetType === 'ctb' && setIndex >= Math.floor(matchFormat.sets / 2);
                          const maxScore = isPotentialDecidingSet ? 20 : matchFormat.gamesPerSet + 2;
                          return Array.from({ length: maxScore + 1 }, (_, i) => (
                            <option key={i} value={i.toString()}>{i}</option>
                          ));
                        })()}
                      </select>
                    </div>
                    
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <div 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: showEditScoreModal.team2Color }}
                        />
                        <span className="text-sm font-medium">
                          {showEditScoreModal.team2Name.length > 20 
                            ? showEditScoreModal.team2Name.substring(0, 20) + '...'
                            : showEditScoreModal.team2Name}
                        </span>
                      </div>
                      <select
                        value={getEditingSetScore(editingScores.team2Score, setIndex)}
                        onChange={(e) => updateEditingSetScore('team2Score', setIndex, e.target.value)}
                        className="w-full p-2 border rounded-lg text-sm"
                      >
                        <option value="">-</option>
                        <option value="X">X (Not played)</option>
                        {(() => {
                          // For CTB, allow flexible scoring on potentially deciding sets
                          const isPotentialDecidingSet = matchFormat.decidingSetType === 'ctb' && setIndex >= Math.floor(matchFormat.sets / 2);
                          const maxScore = isPotentialDecidingSet ? 20 : matchFormat.gamesPerSet + 2;
                          return Array.from({ length: maxScore + 1 }, (_, i) => (
                            <option key={i} value={i.toString()}>{i}</option>
                          ));
                        })()}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                <div className="font-medium text-blue-900 mb-1">Current Format:</div>
                <div className="text-blue-800">
                  {matchFormat.sets === 1 ? '1 Set' : `Best of ${matchFormat.sets} Sets`} • {matchFormat.gamesPerSet} Games per Set
                  <br />
                  Winner: {matchFormat.winnerBy === 'sets' ? 'Most Sets' : 'Most Games'}
                  <br />
                  Deciding Set: {matchFormat.decidingSetType === 'ctb' ? 'Championship Tie-Break' : 'Normal Set'}
                </div>
              </div>
            </div>
            
            <div className="flex gap-3 justify-end mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setShowEditScoreModal(null);
                  setEditingScores({ team1Score: "", team2Score: "" });
                }}
              >
                Cancel
              </Button>
              <Button onClick={saveEditedScores}>
                Save Score
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}