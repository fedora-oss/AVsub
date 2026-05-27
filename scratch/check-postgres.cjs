const { PrismaClient } = require('@prisma/client');

const POSTGRES_URL = 'postgresql://javinizer:javinizer_password@127.0.0.1:5433/javinizer?schema=public';

async function main() {
  console.log('=== Checking PostgreSQL Database Library ===');

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: POSTGRES_URL
      }
    }
  });

  try {
    await prisma.$connect();
    console.log('Connected to PostgreSQL successfully.\n');

    // 1. Get total counts
    const movieCount = await prisma.movie.count();
    const actressCount = await prisma.actress.count();
    const genreCount = await prisma.genre.count();
    const movieActressCount = await prisma.movieActress.count();
    const movieGenreCount = await prisma.movieGenre.count();

    console.log('--- Database Record Statistics ---');
    console.log(`Movies:       ${movieCount}`);
    console.log(`Actresses:    ${actressCount}`);
    console.log(`Genres:       ${genreCount}`);
    console.log(`Relations (Movie-Actress): ${movieActressCount}`);
    console.log(`Relations (Movie-Genre):   ${movieGenreCount}`);
    console.log('----------------------------------\n');

    // 2. Query sample movie (e.g. SNOS-182)
    console.log('--- Querying SNOS-182 in PostgreSQL ---');
    const snos = await prisma.movie.findFirst({
      where: {
        id: 'SNOS-182'
      },
      include: {
        actresses: {
          include: {
            actress: true
          }
        },
        genres: {
          include: {
            genre: true
          }
        }
      }
    });

    if (snos) {
      console.log(`Found movie: ${snos.id}`);
      console.log(`Title: ${snos.display_title || snos.title}`);
      console.log(`Release Date: ${snos.release_date}`);
      console.log('Actresses:');
      snos.actresses.forEach(ma => {
        const a = ma.actress;
        if (a) {
          console.log(` - ID: ${a.id}, Name: ${[a.first_name, a.last_name].filter(Boolean).join(' ') || a.japanese_name}`);
        }
      });
      console.log('Genres:');
      snos.genres.forEach(mg => {
        const g = mg.genre;
        if (g) {
          console.log(` - Name: ${g.name}`);
        }
      });
    } else {
      console.log('Movie SNOS-182 not found in PostgreSQL!');
    }

  } catch (err) {
    console.error('Error querying PostgreSQL database:', err.message);
  } finally {
    await prisma.$disconnect();
    console.log('\nDisconnected from PostgreSQL.');
  }
}

main();
