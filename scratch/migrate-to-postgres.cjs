const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { PrismaClient } = require('@prisma/client');

// Configurations
const SQLITE_DB_PATH = '/srv/nas_share/Database/javinizer/javinizer.db';
const POSTGRES_URL = 'postgresql://javinizer:javinizer_password@127.0.0.1:5433/javinizer?schema=public';

async function main() {
  console.log('=== Starting Javinizer SQLite to PostgreSQL Database Migration ===');

  // 1. Verify SQLite file exists
  if (!fs.existsSync(SQLITE_DB_PATH)) {
    console.error(`Error: SQLite database file not found at: ${SQLITE_DB_PATH}`);
    process.exit(1);
  }
  console.log(`SQLite database verified at: ${SQLITE_DB_PATH}`);

  // 2. Open SQLite Database Sync
  let sqliteDb;
  try {
    sqliteDb = new DatabaseSync(SQLITE_DB_PATH);
    console.log('Successfully opened SQLite database connection.');
  } catch (err) {
    console.error('Failed to open SQLite database:', err.message);
    process.exit(1);
  }

  // Helper to query SQLite
  function querySQLite(sql) {
    const statement = sqliteDb.prepare(sql);
    return statement.all();
  }

  // 3. Initialize Prisma Client for PostgreSQL
  console.log('Connecting to PostgreSQL database...');
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: POSTGRES_URL
      }
    }
  });

  try {
    await prisma.$connect();
    console.log('Successfully connected to PostgreSQL database.');
  } catch (err) {
    console.error('Failed to connect to PostgreSQL database:', err.message);
    console.error('Ensure that the postgresql container is running and exposed at 127.0.0.1:5432');
    process.exit(1);
  }

  try {
    // 4. Begin Data Migration in relational dependency order
    
    // --- Step A: Genres ---
    console.log('\n--- Migrating genres ---');
    const genres = querySQLite('SELECT * FROM genres');
    console.log(`Loaded ${genres.length} genres from SQLite.`);
    if (genres.length > 0) {
      const result = await prisma.genre.createMany({
        data: genres.map(g => ({
          id: g.id,
          name: g.name
        })),
        skipDuplicates: true
      });
      console.log(`Successfully migrated ${result.count} genres to PostgreSQL.`);
    }

    // --- Step B: Actresses ---
    console.log('\n--- Migrating actresses ---');
    const actresses = querySQLite('SELECT * FROM actresses');
    console.log(`Loaded ${actresses.length} actresses from SQLite.`);
    if (actresses.length > 0) {
      const batchSize = 1000;
      let totalMigrated = 0;
      for (let i = 0; i < actresses.length; i += batchSize) {
        const batch = actresses.slice(i, i + batchSize);
        const result = await prisma.actress.createMany({
          data: batch.map(a => ({
            id: a.id,
            dmm_id: a.dmm_id,
            first_name: a.first_name,
            last_name: a.last_name,
            japanese_name: a.japanese_name,
            thumb_url: a.thumb_url,
            aliases: a.aliases,
            created_at: a.created_at ? new Date(a.created_at) : null,
            updated_at: a.updated_at ? new Date(a.updated_at) : null
          })),
          skipDuplicates: true
        });
        totalMigrated += result.count;
      }
      console.log(`Successfully migrated ${totalMigrated} actresses to PostgreSQL.`);
    }

    // --- Step C: Movies ---
    console.log('\n--- Migrating movies ---');
    const movies = querySQLite('SELECT * FROM movies');
    console.log(`Loaded ${movies.length} movies from SQLite.`);
    if (movies.length > 0) {
      const batchSize = 1000;
      let totalMigrated = 0;
      for (let i = 0; i < movies.length; i += batchSize) {
        const batch = movies.slice(i, i + batchSize);
        const result = await prisma.movie.createMany({
          data: batch.map(m => ({
            content_id: m.content_id,
            id: m.id,
            display_title: m.display_title,
            title: m.title,
            original_title: m.original_title,
            description: m.description,
            release_date: m.release_date ? new Date(m.release_date) : null,
            release_year: m.release_year,
            runtime: m.runtime,
            director: m.director,
            maker: m.maker,
            label: m.label,
            series: m.series,
            rating_score: m.rating_score,
            rating_votes: m.rating_votes,
            poster_url: m.poster_url,
            cover_url: m.cover_url,
            cropped_poster_url: m.cropped_poster_url,
            should_crop_poster: m.should_crop_poster !== null ? (m.should_crop_poster === 1 || m.should_crop_poster === true) : null,
            trailer_url: m.trailer_url,
            original_file_name: m.original_file_name,
            screenshots: m.screenshots,
            source_name: m.source_name,
            source_url: m.source_url,
            created_at: m.created_at ? new Date(m.created_at) : null,
            updated_at: m.updated_at ? new Date(m.updated_at) : null,
            original_poster_url: m.original_poster_url,
            original_cropped_poster_url: m.original_cropped_poster_url,
            original_should_crop_poster: m.original_should_crop_poster !== null ? (m.original_should_crop_poster === 1 || m.original_should_crop_poster === true) : null
          })),
          skipDuplicates: true
        });
        totalMigrated += result.count;
      }
      console.log(`Successfully migrated ${totalMigrated} movies to PostgreSQL.`);
    }

    // --- Step D: Movie Actresses Relations ---
    console.log('\n--- Migrating movie_actresses relations ---');
    const movieActresses = querySQLite('SELECT * FROM movie_actresses');
    console.log(`Loaded ${movieActresses.length} movie_actresses relations from SQLite.`);
    if (movieActresses.length > 0) {
      const movieIds = new Set(movies.map(m => m.content_id));
      const actressIds = new Set(actresses.map(a => a.id));
      
      const validMovieActresses = movieActresses.filter(ma => {
        return movieIds.has(ma.movie_content_id) && actressIds.has(ma.actress_id);
      });
      console.log(`Filtered out ${movieActresses.length - validMovieActresses.length} orphan movie_actresses relations.`);

      const batchSize = 2000;
      let totalMigrated = 0;
      for (let i = 0; i < validMovieActresses.length; i += batchSize) {
        const batch = validMovieActresses.slice(i, i + batchSize);
        const result = await prisma.movieActress.createMany({
          data: batch.map(ma => ({
            movie_content_id: ma.movie_content_id,
            actress_id: ma.actress_id
          })),
          skipDuplicates: true
        });
        totalMigrated += result.count;
      }
      console.log(`Successfully migrated ${totalMigrated} movie_actresses relations to PostgreSQL.`);
    }

    // --- Step E: Movie Genres Relations ---
    console.log('\n--- Migrating movie_genres relations ---');
    const movieGenres = querySQLite('SELECT * FROM movie_genres');
    console.log(`Loaded ${movieGenres.length} movie_genres relations from SQLite.`);
    if (movieGenres.length > 0) {
      const movieIds = new Set(movies.map(m => m.content_id));
      const genreIds = new Set(genres.map(g => g.id));
      
      const validMovieGenres = movieGenres.filter(mg => {
        return movieIds.has(mg.movie_content_id) && genreIds.has(mg.genre_id);
      });
      console.log(`Filtered out ${movieGenres.length - validMovieGenres.length} orphan movie_genres relations.`);

      const batchSize = 2000;
      let totalMigrated = 0;
      for (let i = 0; i < validMovieGenres.length; i += batchSize) {
        const batch = validMovieGenres.slice(i, i + batchSize);
        const result = await prisma.movieGenre.createMany({
          data: batch.map(mg => ({
            movie_content_id: mg.movie_content_id,
            genre_id: mg.genre_id
          })),
          skipDuplicates: true
        });
        totalMigrated += result.count;
      }
      console.log(`Successfully migrated ${totalMigrated} movie_genres relations to PostgreSQL.`);
    }

    console.log('\n=== Database Migration Completed Successfully! ===');

  } catch (err) {
    console.error('\nCritical Error during migration:', err.message);
    if (err.stack) console.error(err.stack);
  } finally {
    // Close connections
    if (sqliteDb) {
      sqliteDb.close();
      console.log('Closed SQLite database connection.');
    }
    await prisma.$disconnect();
    console.log('Closed PostgreSQL Prisma database connection.');
  }
}

main();
