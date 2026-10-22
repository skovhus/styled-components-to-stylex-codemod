import"./jsx-runtime-CF8L0Gwd.js";import{t as e}from"./react-lJqMpIaC.js";import{i as t,r as n}from"./styled-components.browser.esm-Dy4oaG3m.js";e();var r={start:`flex-start`,center:`center`,end:`flex-end`,stretch:`stretch`},i=t.div`
  display: flex;
  ${({column:e,direction:t})=>e?n`
          flex-direction: column;
        `:t?n`
            flex-direction: ${t};
          `:``}
  ${({gap:e})=>e===void 0?``:n`
          gap: ${e}px;
        `}
  ${({align:e})=>e?n`
          align-items: ${r[e]};
        `:``}
  ${({justify:e})=>e?n`
          justify-content: ${e};
        `:``}
  ${({center:e})=>e?n`
          align-items: center;
          justify-content: center;
        `:``}
`;export{i as t};