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
    // Leamington Spa coordinates
    const latitude = 52.2928;
    const longitude = -1.5317;
    
    // Get the date for the match (format: YYYY-MM-DD)
    const matchDate = date.toISOString().split('T')[0];
    
    // Try to get weather from Met Office API (free tier)
    // Note: This uses the Met Office DataPoint API which is free but requires registration
    const metOfficeResponse = await fetch(
      `http://datapoint.metoffice.gov.uk/public/data/val/wxfcs/all/json/forecast?res=daily&lat=${latitude}&lon=${longitude}&key=${process.env.MET_OFFICE_API_KEY}`
    ).catch(() => null);
    
    if (metOfficeResponse?.ok && process.env.MET_OFFICE_API_KEY) {
      const weatherData = await metOfficeResponse.json();
      
      // Process Met Office data (simplified)
      if (weatherData?.SiteRep?.DV?.Location?.Period) {
        const periods = weatherData.SiteRep.DV.Location.Period;
        const matchPeriod = periods.find((p: any) => p.value?.startsWith(matchDate));
        
        if (matchPeriod?.Rep?.[0]) {
          const weather = matchPeriod.Rep[0];
          const temp = weather.Dm ? `${weather.Dm}°C` : '';
          const condition = getWeatherDescription(weather.W);
          const rainChance = weather.PPd ? `${weather.PPd}% chance of rain` : '';
          
          return `${condition}${temp ? `, ${temp}` : ''}${rainChance ? `, ${rainChance}` : ''}`;
        }
      }
    }
    
    // Fallback to OpenWeatherMap API (more reliable free tier)
    const openWeatherResponse = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${latitude}&lon=${longitude}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`
    ).catch(() => null);
    
    if (openWeatherResponse?.ok && process.env.OPENWEATHER_API_KEY) {
      const weatherData = await openWeatherResponse.json();
      
      // Find forecast for the match date
      const matchForecast = weatherData.list?.find((item: any) => {
        const forecastDate = new Date(item.dt * 1000);
        return forecastDate.toDateString() === date.toDateString();
      });
      
      if (matchForecast) {
        const temp = Math.round(matchForecast.main.temp);
        const description = matchForecast.weather[0].description;
        const humidity = matchForecast.main.humidity;
        
        let advice = "";
        if (matchForecast.weather[0].main.includes("Rain")) {
          advice = " - Check court availability due to rain";
        } else if (temp > 25) {
          advice = " - Bring extra water and sun protection";
        } else if (temp < 10) {
          advice = " - Dress warmly for cooler conditions";
        }
        
        return `${description.charAt(0).toUpperCase() + description.slice(1)}, ${temp}°C, ${humidity}% humidity${advice}`;
      }
    }
    
    // Final fallback - seasonal advice
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
              <p style="margin: 0; color: #0f172a; font-size: 14px;">${weatherForecast}</p>
            </div>

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
${weatherForecast}

📝 Important Reminders:
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