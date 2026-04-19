update candidates
set websites = array(
  select jsonb_array_elements_text(raw_enrich->'contact'->'websites')
)
where raw_enrich->'contact'->'websites' is not null
  and jsonb_array_length(raw_enrich->'contact'->'websites') > 0
  and (websites is null or websites = '{}');
