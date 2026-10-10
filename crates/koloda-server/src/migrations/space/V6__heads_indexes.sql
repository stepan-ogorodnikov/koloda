-- WHY: pull pages, lease ends, and cascades join versions to their heads by lane seq, and a lease or a collection
-- pass reads one lane's heads; without these indexes each of those reads scans every head of the space.
CREATE INDEX IF NOT EXISTS heads_version ON heads (lane, seq);

CREATE INDEX IF NOT EXISTS heads_lane_grp ON heads (lane, grp, seq);
