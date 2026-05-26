import"./jsx-runtime-B8sTdNyf.js";import{c as e,d as t,p as n}from"./index-DIqbeRvW.js";n();var r={start:`flex-start`,center:`center`,end:`flex-end`,stretch:`stretch`},i=e.div`
  display: flex;
  ${({column:e,direction:n})=>e?t`
          flex-direction: column;
        `:n?t`
            flex-direction: ${n};
          `:``}
  ${({gap:e})=>e===void 0?``:t`
          gap: ${e}px;
        `}
  ${({align:e})=>e?t`
          align-items: ${r[e]};
        `:``}
  ${({justify:e})=>e?t`
          justify-content: ${e};
        `:``}
  ${({center:e})=>e?t`
          align-items: center;
          justify-content: center;
        `:``}
`;export{i as t};