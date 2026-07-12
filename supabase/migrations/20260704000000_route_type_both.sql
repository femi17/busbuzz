-- Add BOTH to route_type enum
-- Allows a single route to serve both morning pickup and afternoon dropoff
ALTER TYPE route_type ADD VALUE IF NOT EXISTS 'BOTH';
