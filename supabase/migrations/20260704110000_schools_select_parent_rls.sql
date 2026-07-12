-- Parents can read the school record for their own children.
-- Missing previously: the child-confirmation screen embeds schools(name)
-- via students, which RLS silently nulled out for parents.

create policy schools_select_parent
on schools for select
using (
  busbuzz_auth_role() = 'PARENT'
  and exists (
    select 1
    from students st
    join student_parents sp on sp.student_id = st.id
    where st.school_id = schools.id
      and sp.parent_id = auth.uid()
  )
);
