import { Resend } from 'resend';
import { prisma } from '@/lib/prisma';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

interface TeamMember {
  id: string;
  email: string;
  name: string | null;
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

async function getWeatherForecast(date: Date): Promise<string> {
  try {
    // First, try to get weather from cache
    const matchDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()); // Normalize to midnight
    
    const cachedWeather = await prisma.weatherCache.findUnique({
      where: { date: matchDate }
    });
    
    if (cachedWeather) {
      // Use cached weather data
      const temp = cachedWeather.temperature;
      const description = cachedWeather.weatherType;
      const humidity = cachedWeather.humidity;
      const rainChance = cachedWeather.precipitationProbability;
      
      let advice = "";
      let gearReminder = "";
      
      // Weather-based advice
      if (description.toLowerCase().includes("rain") || (rainChance && rainChance > 50)) {
        advice = " - Check court availability due to rain";
        gearReminder = "Bring waterproof jacket and towels. Courts may be slippery.";
      } else if (description.toLowerCase().includes("snow")) {
        advice = " - Courts may be closed due to snow";
        gearReminder = "Dress in warm layers, waterproof shoes, and check court availability before travelling.";
      } else if (temp > 28) {
        advice = " - Very hot conditions";
        gearReminder = "Bring extra water (2+ bottles), electrolyte drinks, sun hat, sunglasses, and SPF 30+ sunscreen. Consider light-colored clothing.";
      } else if (temp > 23) {
        advice = " - Warm conditions";
        gearReminder = "Bring extra water, sun hat, and sunscreen. Light breathable clothing recommended.";
      } else if (temp < 5) {
        advice = " - Very cold conditions";
        gearReminder = "Dress in warm layers, thermal base layers, winter jacket, warm-up suit, and gloves for between games.";
      } else if (temp < 12) {
        advice = " - Cool conditions";
        gearReminder = "Dress in layers, bring a warm-up jacket, and consider long sleeves/leggings.";
      }
      
      const tempRange = cachedWeather.minTemperature ? `${cachedWeather.minTemperature}-${temp}°C` : `${temp}°C`;
      const humidityText = humidity ? `, ${humidity}% humidity` : '';
      const rainText = rainChance ? `, ${rainChance}% chance of rain` : '';
      
      const weatherInfo = `${description}, ${tempRange}${humidityText}${rainText}${advice}`;
      return gearReminder ? `${weatherInfo}|GEAR|${gearReminder}` : weatherInfo;
    }
    
    // If no cached data, fall back to seasonal advice
    console.log(`No cached weather data for ${matchDate.toISOString().split('T')[0]}`);
    const month = date.getMonth() + 1;
    if (month >= 12 || month <= 2) {
      return "Winter conditions expected - dress warmly and check for court availability";
    } else if (month >= 3 && month <= 5) {
      return "Spring weather - layers recommended as temperatures can vary";
    } else if (month >= 6 && month <= 8) {
      return "Summer conditions - bring sun protection and extra water";
    } else {
      return "Autumn weather - check for rain and dress appropriately";
    }
    
  } catch (error) {
    console.error('Weather forecast error:', error);
    return "Please check the weather forecast before your match";
  }
}

function getWeatherDescription(weatherCode: string): string {
  // Met Office weather codes to descriptions
  const codes: { [key: string]: string } = {
    '0': 'Clear night',
    '1': 'Sunny day',
    '2': 'Partly cloudy',
    '3': 'Partly cloudy',
    '5': 'Mist',
    '6': 'Fog',
    '7': 'Cloudy',
    '8': 'Overcast',
    '9': 'Light rain shower',
    '10': 'Light rain',
    '11': 'Drizzle',
    '12': 'Light rain',
    '13': 'Heavy rain shower',
    '14': 'Heavy rain',
    '15': 'Heavy rain'
  };
  
  return codes[weatherCode] || 'Variable conditions';
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
    const weatherForecast = await getWeatherForecast(matchDetails.startAt);

    // Collect all recipients who want match notifications
    const recipients = [
      ...team1Members.filter(member => member.receiveMatchNotifications),
      ...team2Members.filter(member => member.receiveMatchNotifications)
    ];

    if (recipients.length === 0) {
      console.log('ℹ️ No recipients want match notifications - skipping email');
      return;
    }

    // Parse weather forecast and gear recommendations
    const [weatherInfo, gearRecommendation] = weatherForecast.includes('|GEAR|') 
      ? weatherForecast.split('|GEAR|') 
      : [weatherForecast, ''];

    // Send email to each recipient
    for (const recipient of recipients) {
      const isTeam1 = team1Members.some(m => m.id === recipient.id);
      const opponentTeamName = isTeam1 ? team2Name : team1Name;
      const recipientName = recipient.name || recipient.email;

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

            <div style="background: #f0f9ff; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0ea5e9;">
              <h3 style="color: #0369a1; margin: 0 0 8px 0; font-size: 16px;">🌤️ Weather Forecast</h3>
              <p style="margin: 0; color: #0f172a; font-size: 14px;">${weatherInfo}</p>
            </div>

            ${gearRecommendation ? `
            <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
              <h3 style="color: #92400e; margin: 0 0 8px 0; font-size: 16px;">🎾 Recommended Gear</h3>
              <p style="margin: 0; color: #78350f; font-size: 14px;">${gearRecommendation}</p>
            </div>
            ` : ''}

            <div style="background: #fef7cd; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
              <h3 style="color: #92400e; margin: 0 0 8px 0; font-size: 16px;">📝 Important Reminders</h3>
              <ul style="margin: 0; padding-left: 20px; color: #78350f;">
                <li style="margin-bottom: 6px;">Please remember to check the weather beforehand</li>
                <li style="margin-bottom: 6px;">Let your opponents know if you're running late - a walkover can be taken after 15 minutes no show</li>
                <li style="margin-bottom: 6px;">Remember to bring water</li>
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


🌤️ Weather Forecast:
${weatherInfo}

${gearRecommendation ? `🎾 Recommended Gear:
${gearRecommendation}

` : ''}📝 Important Reminders:
• Please remember to check the weather beforehand
• Let your opponents know if you're running late - a walkover can be taken after 15 minutes no show  
• Remember to bring water

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

export async function sendMatchCancellationEmail(matchDetails: MatchDetails, cancellationReason?: string) {
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

    // Get ladder information to show end date
    // First try to get the match from database to get the ladderId
    let ladder = null;
    try {
      const matchFromDb = await prisma.match.findUnique({
        where: { id: matchDetails.id },
        select: { ladderId: true }
      });
      
      if (matchFromDb?.ladderId) {
        ladder = await prisma.ladder.findUnique({
          where: { id: matchFromDb.ladderId },
          select: { endDate: true, name: true }
        });
      }
    } catch (error) {
      console.log('Could not fetch ladder information:', error);
    }

    const ladderEndDate = ladder?.endDate ? formatDateTime(ladder.endDate) : 'Check ladder schedule';
    const rescheduleUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/?reschedule=${matchDetails.id}`;

    // Collect all recipients who want match notifications
    const recipients = [
      ...team1Members.filter(member => member.receiveMatchNotifications),
      ...team2Members.filter(member => member.receiveMatchNotifications)
    ];

    if (recipients.length === 0) {
      console.log('ℹ️ No recipients want match notifications - skipping cancellation email');
      return;
    }

    // Send email to each recipient
    for (const recipient of recipients) {
      const isTeam1 = team1Members.some(m => m.id === recipient.id);
      const opponentTeamName = isTeam1 ? team2Name : team1Name;
      const recipientName = recipient.name || recipient.email;

      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
          <div style="background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 24px; font-weight: bold;">❌ Match Cancelled</h1>
            <p style="margin: 8px 0 0 0; opacity: 0.9;">Your tennis match has been cancelled</p>
          </div>
          
          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <h2 style="color: #dc2626; margin: 0 0 16px 0; font-size: 18px;">Hi ${recipientName}!</h2>
            
            <p style="margin: 16px 0; color: #374151; line-height: 1.6;">
              Unfortunately, your tennis match has been cancelled. Here are the details of the cancelled match:
            </p>

            <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #ef4444;">
              <h3 style="color: #991b1b; margin: 0 0 12px 0; font-size: 16px; font-weight: 600;">Cancelled Match Details</h3>
              <div style="space-y: 8px;">
                <p style="margin: 4px 0; color: #7f1d1d;"><strong style="color: #991b1b;">Date & Time:</strong> ${matchDateTime}</p>
                <p style="margin: 4px 0; color: #7f1d1d;"><strong style="color: #991b1b;">Your Team:</strong> ${isTeam1 ? team1Name : team2Name}</p>
                <p style="margin: 4px 0; color: #7f1d1d;"><strong style="color: #991b1b;">Opponents:</strong> ${opponentTeamName}</p>
                <p style="margin: 4px 0; color: #7f1d1d;"><strong style="color: #991b1b;">Match ID:</strong> #${matchDetails.id.slice(-6)}</p>
                ${cancellationReason ? `<p style="margin: 4px 0; color: #7f1d1d;"><strong style="color: #991b1b;">Reason:</strong> ${cancellationReason}</p>` : ''}
              </div>
            </div>

            <div style="background: #f0f9ff; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0ea5e9;">
              <h3 style="color: #0369a1; margin: 0 0 8px 0; font-size: 16px;">⏰ Important Deadline</h3>
              <p style="margin: 0; color: #0f172a; font-size: 14px;">
                <strong>Ladder ends:</strong> ${ladderEndDate}<br>
                Please reschedule as soon as possible to avoid missing your chance to play this season.
              </p>
            </div>

            <div style="text-align: center; margin: 24px 0;">
              <a href="${rescheduleUrl}" 
                 style="background: #0ea5e9; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 16px;">
                Reschedule Match
              </a>
            </div>

            <div style="background: #fef7cd; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
              <h3 style="color: #92400e; margin: 0 0 8px 0; font-size: 16px;">💡 Next Steps</h3>
              <ul style="margin: 0; padding-left: 20px; color: #78350f;">
                <li style="margin-bottom: 6px;">Use the reschedule button above to find a new time</li>
                <li style="margin-bottom: 6px;">Coordinate with your opponents for available dates</li>
                <li style="margin-bottom: 6px;">Book early - popular time slots fill up quickly</li>
                <li>Contact support if you need help with rescheduling</li>
              </ul>
            </div>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
            
            <p style="margin: 0; color: #6b7280; font-size: 14px; text-align: center;">
              Sorry for the inconvenience! 🎾<br>
              <span style="color: #9ca3af;">Tennis Ladder Team</span>
            </p>
          </div>
        </div>
      `;

      const textContent = `
❌ Match Cancelled

Hi ${recipientName}!

Unfortunately, your tennis match has been cancelled. Here are the details:

📅 Date & Time: ${matchDateTime}
👥 Your Team: ${isTeam1 ? team1Name : team2Name}  
🆚 Opponents: ${opponentTeamName}
🔗 Match ID: #${matchDetails.id.slice(-6)}
${cancellationReason ? `❗ Reason: ${cancellationReason}` : ''}

⏰ Important Deadline:
Ladder ends: ${ladderEndDate}
Please reschedule as soon as possible to avoid missing your chance to play this season.

🔗 Reschedule Match:
${rescheduleUrl}

💡 Next Steps:
• Use the reschedule link above to find a new time
• Coordinate with your opponents for available dates  
• Book early - popular time slots fill up quickly
• Contact support if you need help with rescheduling

Sorry for the inconvenience! 🎾

Tennis Ladder Team
      `;

      await resend.emails.send({
        from: 'Tennis Ladder <noreply@ladderschedule.com>',
        to: [recipient.email],
        subject: `❌ Match Cancelled - ${team1Name} vs ${team2Name}`,
        html: htmlContent,
        text: textContent
      });

      console.log(`✅ Match cancellation email sent to ${recipient.email}`);
    }

  } catch (error) {
    console.error('❌ Failed to send match cancellation email:', error);
  }
}

export async function sendEmailVerification(email: string, name: string, verificationToken: string) {
  if (!resend) {
    console.error('❌ Resend API key not configured');
    throw new Error('Email service not configured');
  }

  const verificationUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/auth/verify-email?token=${verificationToken}`;

  try {
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
        <div style="background: linear-gradient(135deg, #065f46 0%, #059669 100%); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 24px; font-weight: bold;">🎾 Welcome to Tennis Ladder!</h1>
          <p style="margin: 8px 0 0 0; opacity: 0.9;">Please verify your email to activate your account</p>
        </div>
        
        <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
          <h2 style="color: #059669; margin: 0 0 16px 0; font-size: 18px;">Hi ${name}!</h2>
          
          <p style="margin: 16px 0; color: #374151; line-height: 1.6;">
            Thank you for signing up for Tennis Ladder! To complete your registration and start playing, 
            please verify your email address by clicking the button below.
          </p>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${verificationUrl}" 
               style="background: #059669; color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 16px;">
              Verify Email Address
            </a>
          </div>

          <div style="background: #f0f9ff; padding: 16px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #0ea5e9;">
            <h3 style="color: #0369a1; margin: 0 0 8px 0; font-size: 16px;">What happens next?</h3>
            <p style="margin: 0; color: #0f172a;">Once verified, you'll be automatically logged in and can:</p>
            <ul style="margin: 8px 0 0 20px; color: #0f172a;">
              <li>Set your availability for matches</li>
              <li>Find partners and opponents</li>
              <li>Schedule and confirm matches</li>
              <li>Track your ladder progress</li>
            </ul>
          </div>

          <div style="background: #fef7cd; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
            <p style="margin: 0; color: #92400e; font-size: 14px;">
              <strong>Important:</strong> This verification link will expire in 24 hours. 
              If you didn't create an account, please ignore this email.
            </p>
          </div>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
          
          <p style="margin: 0; color: #6b7280; font-size: 14px; text-align: center;">
            Welcome to the Tennis Ladder community! 🏆<br>
            <span style="color: #9ca3af;">Tennis Ladder Team</span>
          </p>
        </div>
      </div>
    `;

    const textContent = `
🎾 Welcome to Tennis Ladder!

Hi ${name}!

Thank you for signing up for Tennis Ladder! To complete your registration and start playing, please verify your email address by clicking the link below:

${verificationUrl}

What happens next?
Once verified, you'll be automatically logged in and can:
• Set your availability for matches
• Find partners and opponents  
• Schedule and confirm matches
• Track your ladder progress

Important: This verification link will expire in 24 hours. If you didn't create an account, please ignore this email.

Welcome to the Tennis Ladder community! 🏆

Tennis Ladder Team
    `;

    const result = await resend.emails.send({
      from: 'Tennis Ladder <noreply@ladderschedule.com>',
      to: [email],
      subject: '🎾 Welcome to Tennis Ladder - Please Verify Your Email',
      html: htmlContent,
      text: textContent
    });

    console.log(`✅ Verification email sent to ${email}`);
    return result;

  } catch (error) {
    console.error('❌ Failed to send verification email:', error);
    throw error;
  }
}