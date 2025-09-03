import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

async function exportTable(tableName, query) {
  try {
    const data = await query();
    console.log(`   ✅ ${tableName}: ${data.length} records`);
    return data;
  } catch (error) {
    console.log(`   ⚠️ ${tableName}: Table not found or empty (${error.code})`);
    return [];
  }
}

async function exportData() {
  try {
    console.log('🔄 Exporting data from SQLite database...');
    console.log('📊 Checking tables...');
    
    // Export all tables with error handling
    const users = await exportTable('Users', () => prisma.user.findMany());
    const ladders = await exportTable('Ladders', () => prisma.ladder.findMany());
    const matches = await exportTable('Matches', () => prisma.match.findMany());
    const availability = await exportTable('Availability', () => prisma.availability.findMany());
    const weatherCache = await exportTable('WeatherCache', () => prisma.weatherCache.findMany());
    const hourlyWeatherCache = await exportTable('HourlyWeatherCache', () => prisma.hourlyWeatherCache.findMany());

    const exportData = {
      users,
      ladders, 
      matches,
      availability,
      weatherCache,
      hourlyWeatherCache,
      exportedAt: new Date().toISOString()
    };

    // Save to JSON file
    fs.writeFileSync('data-export.json', JSON.stringify(exportData, null, 2));
    
    console.log('✅ Data exported successfully to data-export.json');
    
  } catch (error) {
    console.error('❌ Export failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

exportData();