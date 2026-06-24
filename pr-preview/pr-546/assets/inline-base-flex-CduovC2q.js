import"./jsx-runtime-D4ePz0Hl.js";import{l as e,m as t,u as n}from"./index-CU8qmYyO.js";t();var r={start:`flex-start`,center:`center`,end:`flex-end`,stretch:`stretch`},i=n.div`
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