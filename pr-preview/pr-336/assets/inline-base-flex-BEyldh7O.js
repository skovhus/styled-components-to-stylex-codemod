import{s as e,c as s}from"./index-DffDmfQi.js";const c={start:"flex-start",center:"center",end:"flex-end",stretch:"stretch"},i=s.div`
  display: flex;
  ${({column:t,direction:n})=>t?e`
          flex-direction: column;
        `:n?e`
            flex-direction: ${n};
          `:""}
  ${({gap:t})=>t!==void 0?e`
          gap: ${t}px;
        `:""}
  ${({align:t})=>t?e`
          align-items: ${c[t]};
        `:""}
  ${({justify:t})=>t?e`
          justify-content: ${t};
        `:""}
  ${({center:t})=>t?e`
          align-items: center;
          justify-content: center;
        `:""}
`;export{i as F};
