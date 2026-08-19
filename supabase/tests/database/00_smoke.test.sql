begin;
select plan(1);

select ok(true, 'pgTAP runner is wired up');

select * from finish();
rollback;
