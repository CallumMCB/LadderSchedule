import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

async function importData() {
  try {
    console.log('🔄 Reading exported data...');
    
    if (!fs.existsSync('data-export.json')) {
      console.error('❌ data-export.json not found! Run export script first.');
      return;
    }
    
    const data = JSON.parse(fs.readFileSync('data-export.json', 'utf8'));
    
    console.log('🔄 Importing data to PostgreSQL database...');
    
    // Import in order (respecting foreign key constraints)
    
    // 1. Users first (no dependencies)
    console.log('📥 Importing users...');
    for (const user of data.users) {
      try {
        await prisma.user.create({
          data: {
            id: user.id,
            email: user.email,
            name: user.name,
            password: user.password,
            phone: user.phone,
            resetToken: user.resetToken,
            resetTokenExpiry: user.resetTokenExpiry ? new Date(user.resetTokenExpiry) : null,
            otpCode: user.otpCode,
            otpExpiry: user.otpExpiry ? new Date(user.otpExpiry) : null,
            notificationPreference: user.notificationPreference,
            receiveUpdates: user.receiveUpdates,
            receiveMatchNotifications: user.receiveMatchNotifications,
            receiveMarketing: user.receiveMarketing,
            emailVerified: user.emailVerified,
            emailVerificationToken: user.emailVerificationToken,
            emailVerificationExpiry: user.emailVerificationExpiry ? new Date(user.emailVerificationExpiry) : null,
            partnerId: user.partnerId,
            ladderId: user.ladderId,
            createdAt: new Date(user.createdAt)
          }
        });
      } catch (error) {
        if (error.code === 'P2002') {
          console.log(`   ⚠️  User ${user.email} already exists, skipping`);
        } else {
          console.error(`   ❌ Error importing user ${user.email}:`, error.message);
        }
      }
    }
    
    // 2. Ladders (no dependencies)
    console.log('📥 Importing ladders...');
    for (const ladder of data.ladders) {
      try {
        await prisma.ladder.create({
          data: {
            id: ladder.id,
            name: ladder.name,
            number: ladder.number,
            endDate: new Date(ladder.endDate),
            isActive: ladder.isActive,
            winnerBy: ladder.winnerBy,
            matchFormat: ladder.matchFormat,
            createdAt: new Date(ladder.createdAt)
          }
        });
      } catch (error) {
        if (error.code === 'P2002') {
          console.log(`   ⚠️  Ladder ${ladder.name} already exists, skipping`);
        } else {
          console.error(`   ❌ Error importing ladder ${ladder.name}:`, error.message);
        }
      }
    }
    
    // 3. Availability (depends on users)
    console.log('📥 Importing availability...');
    for (const avail of data.availability) {
      try {
        await prisma.availability.create({
          data: {
            id: avail.id,
            userId: avail.userId,
            startAt: new Date(avail.startAt),
            weekStart: new Date(avail.weekStart),
            availability: avail.availability,
            setByUserId: avail.setByUserId
          }
        });
      } catch (error) {
        if (error.code === 'P2002') {
          console.log(`   ⚠️  Availability entry already exists, skipping`);
        } else {
          console.error(`   ❌ Error importing availability:`, error.message);
        }
      }
    }
    
    // 4. Matches (depends on ladders)
    console.log('📥 Importing matches...');
    for (const match of data.matches) {
      try {
        await prisma.match.create({
          data: {
            id: match.id,
            startAt: new Date(match.startAt),
            team1Id: match.team1Id,
            team2Id: match.team2Id,
            confirmed: match.confirmed,
            confirmedAt: new Date(match.confirmedAt),
            createdAt: new Date(match.createdAt),
            team1Score: match.team1Score,
            team2Score: match.team2Score,
            team1DetailedScore: match.team1DetailedScore,
            team2DetailedScore: match.team2DetailedScore,
            completed: match.completed,
            ladderId: match.ladderId
          }
        });
      } catch (error) {
        if (error.code === 'P2002') {
          console.log(`   ⚠️  Match already exists, skipping`);
        } else {
          console.error(`   ❌ Error importing match:`, error.message);
        }
      }
    }
    
    // 5. Weather cache (no dependencies)
    console.log('📥 Importing weather cache...');
    for (const weather of data.weatherCache) {
      try {
        await prisma.weatherCache.create({
          data: {
            id: weather.id,
            date: new Date(weather.date),
            temperature: weather.temperature,
            minTemperature: weather.minTemperature,
            weatherType: weather.weatherType,
            precipitationProbability: weather.precipitationProbability,
            windSpeed: weather.windSpeed,
            windDirection: weather.windDirection,
            uvIndex: weather.uvIndex,
            visibility: weather.visibility,
            humidity: weather.humidity,
            updatedAt: new Date(weather.updatedAt)
          }
        });
      } catch (error) {
        if (error.code === 'P2002') {
          console.log(`   ⚠️  Weather cache entry already exists, skipping`);
        } else {
          console.error(`   ❌ Error importing weather cache:`, error.message);
        }
      }
    }
    
    console.log('✅ Data import completed successfully!');
    
    // Final count
    const counts = await Promise.all([
      prisma.user.count(),
      prisma.ladder.count(),
      prisma.match.count(),
      prisma.availability.count(),
      prisma.weatherCache.count()
    ]);
    
    console.log('📊 Final database counts:');
    console.log(`   - Users: ${counts[0]}`);
    console.log(`   - Ladders: ${counts[1]}`);
    console.log(`   - Matches: ${counts[2]}`);
    console.log(`   - Availability: ${counts[3]}`);
    console.log(`   - Weather Cache: ${counts[4]}`);
    
  } catch (error) {
    console.error('❌ Import failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

importData();