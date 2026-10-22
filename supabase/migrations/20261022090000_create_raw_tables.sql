-- Raw source tables, 1:1 with data/*.csv (Google Sheet tabs). Column names are kept as in the sheet.
-- Code columns stay text (leading zeros matter, e.g. '031'); empty CSV cells are loaded as NULL.
-- RLS is on with no policy for anon/authenticated: only the service_role key (load_raw.py) can read or write.

create table public.patient (
  jid           bigint primary key,
  sex_tp_cd     text,
  birth_yr      int,
  sido_cd       text,
  qlf_tp_cd     text,
  prem_quintile int
);

create table public.institution (
  yid          bigint primary key,
  cl_cd        text,
  region_cd    text,
  shw_sbjt_cd  text
);

create table public.claim (
  mid                bigint primary key,
  jid                bigint not null references public.patient (jid),
  yid                bigint not null references public.institution (yid),
  insup_tp_cd        text,
  fom_tp_cd          text,
  main_sick          text,
  sub_sick           text,
  dgsbjt_cd          text,
  recu_fr_dd         date,
  recu_to_dd         date,
  vst_ddcnt          int,
  recu_ddcnt         int,
  rvd_rpe_tamt_amt   bigint,
  rvd_slf_brdn_amt   bigint,
  rvd_insup_brdn_amt bigint,
  sopr_yn            text,
  dgrslt_tp_cd       text
);
create index claim_jid_idx on public.claim (jid);
create index claim_yid_idx on public.claim (yid);
create index claim_main_sick_idx on public.claim (main_sick);

create table public.claim_sick (
  mid            bigint not null references public.claim (mid),
  sick_sno       int not null,
  dmd_dgsbjt_cd  text,
  sick_cd        text,
  primary key (mid, sick_sno)
);

create table public.claim_rx (
  mid                     bigint not null references public.claim (mid),
  ln_no                   int not null,
  gnl_cd                  text,
  fq1_mdct_qty            numeric,
  dy1_mdct_qty            numeric,
  tot_injc_ddcnt_exec_fq  numeric,
  tot_use_qty_or_exec_fq  numeric,
  unprc                   numeric,
  amt                     numeric,
  primary key (mid, ln_no)
);
create index claim_rx_gnl_cd_idx on public.claim_rx (gnl_cd);

create table public.sick_master (
  sickcd   text primary key,
  krnm     text,
  sicknm   text,
  wcd      text,
  msick    text,
  cdd      text,
  sex      text,
  max_age  int,
  min_age  int,
  wocd     text
);

create table public.drug_ingredient (
  gnl_cd    text primary key,
  form_cd   text,
  form_nm   text,
  gnl_nm    text,
  class_no  text,
  route     text,
  strength  numeric,
  unit      text
);

create table public.code_table (
  code_type text not null,
  code      text not null,
  code_nm   text,
  primary key (code_type, code)
);

create table public.sido_code (
  sido_cd    text primary key,
  sido_nm    text,
  region_cd  text,
  region_nm  text
);

-- No link key to claim (see README): kept for reference only.
create table public.hospital_open (
  hosp_id      bigint primary key,
  yadm_nm      text,
  cl_nm        text,
  sido_nm      text,
  sggu_nm      text,
  shw_sbjt_nm  text,
  open_dd      date
);

alter table public.patient         enable row level security;
alter table public.institution     enable row level security;
alter table public.claim           enable row level security;
alter table public.claim_sick      enable row level security;
alter table public.claim_rx        enable row level security;
alter table public.sick_master     enable row level security;
alter table public.drug_ingredient enable row level security;
alter table public.code_table      enable row level security;
alter table public.sido_code       enable row level security;
alter table public.hospital_open   enable row level security;

grant select, insert, update on
  public.patient, public.institution, public.claim, public.claim_sick, public.claim_rx,
  public.sick_master, public.drug_ingredient, public.code_table, public.sido_code, public.hospital_open
  to service_role;
