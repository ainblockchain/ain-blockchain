CREATE DATABASE ain;
\c ain;

CREATE TABLE blocks(
   height serial PRIMARY KEY,
   hash BYTEA NOT NULL,
   forger CHARACTER VARYING(255)  NOT NULL,
   validators text,
   parent_hash BYTEA NOT NULL,
   created_on TIMESTAMP WITHOUT TIME ZONE NOT NULL
   
);

CREATE TABLE transactions(
   index INTEGER PRIMARY KEY,
   input BYTEA NOT NULL,
   nonce INTEGER NOT NULL,
   s CHARACTER VARYING(255)  NOT NULL,
   block_hash BYTEA NOT NULL,
   block_height INTEGER NOT NULL,
   created_on TIMESTAMP WITHOUT TIME ZONE NOT NULL
);


