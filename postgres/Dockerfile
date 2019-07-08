# BUILD: docker build -t  ainblockchain/postgres .
# RUN:  docker run --rm   --name pg-docker -e POSTGRES_PASSWORD=postgres -d -p 5432:5432   ainblockchain/postgres
# ACCESS: psql -h localhost -U postgres -d postgres

FROM library/postgres
COPY init.sql /docker-entrypoint-initdb.d/
