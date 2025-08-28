# Tennis Doubles Ladder

A comprehensive tennis doubles ladder application with multi-ladder functionality, match scheduling, and team management.

## Features

- **Multi-Ladder System**: Manage multiple tennis ladders with separate team assignments
- **Partner Management**: Link with partners and automatically switch ladders together  
- **Match Scheduling**: Schedule matches based on team availability
- **Availability Calendar**: Set availability and proxy availability for partners
- **Score Tracking**: Record match scores and view win/loss records
- **Match Confirmation**: Confirm matches and add to calendar

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: NextAuth.js with credentials provider
- **Styling**: Tailwind CSS with shadcn/ui components
- **Deployment**: Vercel

## Local Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env.local
   ```
   Fill in your database URL and NextAuth configuration.

4. Set up the database:
   ```bash
   npx prisma generate
   npx prisma db push
   npx prisma db seed
   ```

5. Run the development server:
   ```bash
   npm run dev
   ```

## Production Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Connect your GitHub repository to Vercel
3. Set up a PostgreSQL database (free options: Supabase, PlanetScale)
4. Configure environment variables in Vercel:
   - `DATABASE_URL`: Your PostgreSQL connection string
   - `NEXTAUTH_SECRET`: Generate with `openssl rand -base64 32`
   - `NEXTAUTH_URL`: Your production domain (e.g., https://ladderschedule.com)

5. Deploy and run database migrations:
   ```bash
   npx prisma db push
   npx prisma db seed
   ```

## Environment Variables

```bash
# Database
DATABASE_URL="postgresql://username:password@hostname:port/database"

# NextAuth
NEXTAUTH_URL="https://yourdomain.com"
NEXTAUTH_SECRET="your-secret-here"
```

## Database Schema

The application uses four main models:
- **User**: User accounts with partner relationships
- **Ladder**: Different ladder competitions
- **Availability**: Time slot availability for matches
- **Match**: Scheduled matches with scores

## License

MIT