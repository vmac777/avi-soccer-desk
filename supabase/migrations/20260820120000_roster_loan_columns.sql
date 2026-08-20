-- Loan structure for the roster.
--
-- `scouted_targets` came from a scouting model, where a player has exactly one
-- club. An agency's roster does not work that way: a player out on loan has two
-- clubs and two live contracts, and the two dates answer different questions.
--
--   contract_end       when the registration holder's deal expires — this is
--                      what says when the player can be sold or goes free
--   loan_contract_end  when the loan ends and the player goes back
--
-- Collapsing those into one date throws away the half an agent acts on, so they
-- are kept apart.
--
-- `current_club` stays as the club the player actually turns out for — the loan
-- club while on loan — so anything squad-facing keeps working. `owner_club`
-- holds the registration.

ALTER TABLE public.scouted_targets
  ADD COLUMN IF NOT EXISTS tenure            text,
  ADD COLUMN IF NOT EXISTS owner_club        text,
  ADD COLUMN IF NOT EXISTS owner_league      text,
  ADD COLUMN IF NOT EXISTS loan_club         text,
  ADD COLUMN IF NOT EXISTS loan_league       text,
  ADD COLUMN IF NOT EXISTS loan_contract_end date;

-- permanent | loan | free_agent. Left nullable: rows imported before this
-- column existed have no answer, and guessing one would be worse than a null.
ALTER TABLE public.scouted_targets
  DROP CONSTRAINT IF EXISTS scouted_targets_tenure_check;

ALTER TABLE public.scouted_targets
  ADD CONSTRAINT scouted_targets_tenure_check
  CHECK (tenure IS NULL OR tenure IN ('permanent', 'loan', 'free_agent'));

COMMENT ON COLUMN public.scouted_targets.tenure IS
  'permanent | loan | free_agent';
COMMENT ON COLUMN public.scouted_targets.owner_club IS
  'Club holding the registration. Differs from current_club while on loan.';
COMMENT ON COLUMN public.scouted_targets.loan_contract_end IS
  'When the loan ends. Distinct from contract_end, which is the parent deal.';

-- Players out on loan are a working list for an agent: the loan end is often
-- the actionable date, so make that lookup cheap.
CREATE INDEX IF NOT EXISTS idx_scouted_targets_on_loan
  ON public.scouted_targets (loan_contract_end)
  WHERE tenure = 'loan';
