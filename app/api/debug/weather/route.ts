import { NextRequest, NextResponse } from 'next/server';

const MET_OFFICE_API_KEY = process.env.MET_OFFICE_API_KEY;

export async function GET(request: NextRequest) {
  try {
    if (!MET_OFFICE_API_KEY) {
      return NextResponse.json({ error: 'MET_OFFICE_API_KEY not configured' }, { status: 500 });
    }

    console.log('API Key length:', MET_OFFICE_API_KEY.length);
    console.log('API Key starts with:', MET_OFFICE_API_KEY.substring(0, 20));
    
    // Leamington Spa coordinates
    const latitude = 52.2928;
    const longitude = -1.5317;

    // Try different authentication methods
    const testMethods = [
      {
        name: 'apikey header',
        headers: {
          'accept': 'application/json',
          'apikey': MET_OFFICE_API_KEY
        } as Record<string, string>
      },
      {
        name: 'Authorization Bearer',
        headers: {
          'accept': 'application/json',
          'Authorization': `Bearer ${MET_OFFICE_API_KEY}`
        } as Record<string, string>
      },
      {
        name: 'x-api-key header',
        headers: {
          'accept': 'application/json',
          'x-api-key': MET_OFFICE_API_KEY
        } as Record<string, string>
      }
    ];

    const results = [];
    
    // Test the working method and get full structure
    try {
      const response = await fetch(
        `https://data.hub.api.metoffice.gov.uk/sitespecific/v0/point/daily?latitude=${latitude}&longitude=${longitude}&includeLocationName=true`,
        { 
          headers: {
            'accept': 'application/json',
            'apikey': MET_OFFICE_API_KEY
          }
        }
      );
      
      if (response.ok) {
        const fullData = await response.json();
        results.push({
          method: 'apikey header (FULL RESPONSE)',
          status: response.status,
          statusText: response.statusText,
          hasFeatures: !!fullData.features,
          featuresLength: fullData.features?.length,
          hasProperties: !!fullData.features?.[0]?.properties,
          propertyKeys: fullData.features?.[0]?.properties ? Object.keys(fullData.features[0].properties) : [],
          hasTimeSeries: !!fullData.features?.[0]?.properties?.timeSeries,
          timeSeriesLength: fullData.features?.[0]?.properties?.timeSeries?.length,
          firstTimeSeriesKeys: fullData.features?.[0]?.properties?.timeSeries?.[0] ? Object.keys(fullData.features[0].properties.timeSeries[0]) : [],
          sampleTimeSeries: fullData.features?.[0]?.properties?.timeSeries?.slice(0, 2)
        });
      }
    } catch (error) {
      results.push({
        method: 'Full debug',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
    
    // Quick test of other methods
    for (const method of testMethods.slice(1)) {
      try {
        const response = await fetch(
          `https://data.hub.api.metoffice.gov.uk/sitespecific/v0/point/daily?latitude=${latitude}&longitude=${longitude}&includeLocationName=true`,
          { headers: method.headers }
        );
        
        const responseText = await response.text();
        
        results.push({
          method: method.name,
          status: response.status,
          statusText: response.statusText,
          responsePreview: responseText.substring(0, 200)
        });
      } catch (error) {
        results.push({
          method: method.name,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return NextResponse.json({
      apiKeyConfigured: true,
      apiKeyLength: MET_OFFICE_API_KEY.length,
      results
    });

  } catch (error) {
    return NextResponse.json(
      { 
        error: 'Debug failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}