import"./jsx-runtime-B8sTdNyf.js";import{c as e,l as t,p as n}from"./index-Bdv4M7ZO.js";n();var r={start:`flex-start`,center:`center`,end:`flex-end`,stretch:`stretch`},i=t.div`
  display: flex;
  ${({column:t,direction:n})=>t?e`
          flex-direction: column;
        `:n?e`
            flex-direction: ${n};
          `:``}
  ${({gap:t})=>t===void 0?``:e`
          gap: ${t}px;
        `}
  ${({align:t})=>t?e`
          align-items: ${r[t]};
        `:``}
  ${({justify:t})=>t?e`
          justify-content: ${t};
        `:``}
  ${({center:t})=>t?e`
          align-items: center;
          justify-content: center;
        `:``}
`;export{i as t};