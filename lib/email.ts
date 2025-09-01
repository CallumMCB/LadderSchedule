import { Resend } from 'resend';
import { prisma } from '@/lib/prisma';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

interface TeamMember {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  receiveMatchNotifications: boolean;
}

interface MatchDetails {
  id: string;
  startAt: Date;
  team1Id: string;
  team2Id: string;
}

export async function getTeamMembers(teamId: string): Promise<TeamMember[]> {
  if (teamId.includes('-')) {
    // This is a partnership team
    const [user1Id, user2Id] = teamId.split('-');
    const users = await prisma.user.findMany({
      where: {
        id: { in: [user1Id, user2Id] }
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        receiveMatchNotifications: true
      }
    });
    return users;
  } else {
    // This is a single player
    const user = await prisma.user.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        receiveMatchNotifications: true
      }
    });
    return user ? [user] : [];
  }
}

export function formatTeamName(members: TeamMember[]): string {
  if (members.length === 1) {
    return members[0].name || members[0].email;
  } else if (members.length === 2) {
    const name1 = members[0].name || members[0].email;
    const name2 = members[1].name || members[1].email;
    return `${name1} & ${name2}`;
  }
  return 'Unknown Team';
}

export function formatDateTime(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

export async function sendMatchConfirmationEmail(matchDetails: MatchDetails) {
  if (!resend) {
    console.error('❌ Resend API key not configured');
    return;
  }

  try {
    // Get team members for both teams
    const [team1Members, team2Members] = await Promise.all([
      getTeamMembers(matchDetails.team1Id),
      getTeamMembers(matchDetails.team2Id)
    ]);

    const team1Name = formatTeamName(team1Members);
    const team2Name = formatTeamName(team2Members);
    const matchDateTime = formatDateTime(matchDetails.startAt);

    // Collect all recipients who want match notifications
    const recipients = [
      ...team1Members.filter(member => member.receiveMatchNotifications),
      ...team2Members.filter(member => member.receiveMatchNotifications)
    ];

    if (recipients.length === 0) {
      console.log('ℹ️ No recipients want match notifications - skipping email');
      return;
    }

    // Create SMS opt-in URLs for users without phone numbers
    const createOptInUrl = (userId: string, matchId: string) => 
      `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/sms/opt-in?userId=${userId}&matchId=${matchId}`;

    // Send email to each recipient
    for (const recipient of recipients) {
      const isTeam1 = team1Members.some(m => m.id === recipient.id);
      const opponentTeamName = isTeam1 ? team2Name : team1Name;
      const recipientName = recipient.name || recipient.email;
      
      // Check if user has phone number for SMS reminders
      const hasPhone = !!recipient.phone;
      const smsOptInSection = hasPhone ? '' : `
        <div style="background: #f0f9ff; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0ea5e9;">
          <h3 style="color: #0369a1; margin: 0 0 8px 0; font-size: 16px;">📱 Want SMS Reminders?</h3>
          <p style="margin: 0 0 12px 0; color: #0f172a;">Get a reminder 1 hour before your match by adding your phone number.</p>
          <a href="${createOptInUrl(recipient.id, matchDetails.id)}" 
             style="background: #0ea5e9; color: white; padding: 8px 16px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block;">
            Enable SMS Reminders
          </a>
        </div>
      `;

      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
          <div style="background: linear-gradient(135deg, #065f46 0%, #059669 100%); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 24px; font-weight: bold;">🎾 Match Confirmed!</h1>
            <p style="margin: 8px 0 0 0; opacity: 0.9;">Your tennis match has been scheduled</p>
          </div>
          
          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <h2 style="color: #059669; margin: 0 0 16px 0; font-size: 18px;">Hi ${recipientName}!</h2>
            
            <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 16px 0;">
              <h3 style="color: #374151; margin: 0 0 12px 0; font-size: 16px; font-weight: 600;">Match Details</h3>
              <div style="space-y: 8px;">
                <p style="margin: 4px 0; color: #6b7280;"><strong style="color: #374151;">Date & Time:</strong> ${matchDateTime}</p>
                <p style="margin: 4px 0; color: #6b7280;"><strong style="color: #374151;">Your Team:</strong> ${isTeam1 ? team1Name : team2Name}</p>
                <p style="margin: 4px 0; color: #6b7280;"><strong style="color: #374151;">Opponents:</strong> ${opponentTeamName}</p>
                <p style="margin: 4px 0; color: #6b7280;"><strong style="color: #374151;">Match ID:</strong> #${matchDetails.id.slice(-6)}</p>
              </div>
            </div>

            ${smsOptInSection}

            <div style="background: #fef7cd; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
              <h3 style="color: #92400e; margin: 0 0 8px 0; font-size: 16px;">📝 Important Reminders</h3>
              <ul style="margin: 0; padding-left: 20px; color: #78350f;">
                <li style="margin-bottom: 4px;">Please arrive 10 minutes early to warm up</li>
                <li style="margin-bottom: 4px;">Remember to bring water and appropriate tennis gear</li>
                <li style="margin-bottom: 4px;">If you need to reschedule, please do so at least 24 hours in advance</li>
                <li>Check the weather forecast and dress accordingly</li>
              </ul>
            </div>

            <div style="text-align: center; margin: 24px 0;">
              <a href="${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/scoring" 
                 style="background: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
                View Match Details
              </a>
            </div>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
            
            <p style="margin: 0; color: #6b7280; font-size: 14px; text-align: center;">
              Good luck with your match! 🏆<br>
              <span style="color: #9ca3af;">Tennis Ladder Team</span>
            </p>
          </div>
        </div>
      `;

      const textContent = `
🎾 Match Confirmed!

Hi ${recipientName}!

Your tennis match has been scheduled:

📅 Date & Time: ${matchDateTime}
👥 Your Team: ${isTeam1 ? team1Name : team2Name}  
🆚 Opponents: ${opponentTeamName}
🔗 Match ID: #${matchDetails.id.slice(-6)}

${!hasPhone ? `
📱 Want SMS Reminders?
Get a reminder 1 hour before your match by adding your phone number:
${createOptInUrl(recipient.id, matchDetails.id)}
` : ''}

📝 Important Reminders:
• Please arrive 10 minutes early to warm up
• Remember to bring water and appropriate tennis gear  
• If you need to reschedule, please do so at least 24 hours in advance
• Check the weather forecast and dress accordingly

Good luck with your match! 🏆

Tennis Ladder Team
      `;

      await resend.emails.send({
        from: 'Tennis Ladder <noreply@ladderschedule.com>',
        to: [recipient.email],
        subject: `🎾 Match Confirmed - ${team1Name} vs ${team2Name}`,
        html: htmlContent,
        text: textContent
      });

      console.log(`✅ Match confirmation email sent to ${recipient.email}`);
    }

  } catch (error) {
    console.error('❌ Failed to send match confirmation email:', error);
  }
}