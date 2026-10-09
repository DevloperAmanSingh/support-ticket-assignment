# Product Requirements: Automatic Ticket Assignment

## 1. Problem and goal

Support agents work at different hours, on different days, and in different timezones. Today, a team lead assigns each new ticket to an agent manually. This method fails when the team becomes larger:

- Tickets stay unassigned for hours when the lead is offline.
- The lead uses most of the day to assign tickets.
- Some agents have too many tickets. Other agents have none.

**Goal:** The service assigns each new ticket to an eligible agent. The lead does no manual work.

An agent is **eligible** when the agent belongs to the company, is on shift, and has fewer open tickets than the ticket limit. The **ticket limit** is the maximum number of open tickets for one agent. An **open ticket** is a ticket that has an assigned agent and is not closed.

The service is successful when:

- The service assigns a ticket in less than one second when an agent is eligible.
- No agent has more open tickets than the ticket limit of that agent.
- The service always assigns a ticket to the eligible agent with the fewest open tickets.
- The lead can see the reason for each assignment and each hour with no agent on shift.

## 2. Target user

- **Team lead (primary user).** The lead sets the shifts, examines the coverage, and reads the reason for each assignment.
- **Agent.** The agent receives tickets. The agent does not use the service directly.
- **Ticket system.** The ticket system calls the API when a new ticket arrives.

## 3. Scope

**In scope:**

- A UI to set the weekly shifts, the timezone, and the ticket limit of each agent.
- A coverage view that shows each hour that needs an agent and has none.
- An API that accepts a `company_id` and a `ticket_id`. The API returns the assigned agent, or it reports that no agent is eligible.
- An assignment list that shows each ticket, the assigned agent, and the reason. The list also shows each ticket that has no agent.

**Out of scope:** login, roles, billing, account management, mobile, holiday calendars, one-time schedule changes (example: a sick day), and third-party integrations. Also out of scope: assignment by skill, ticket priority, automatic retry, and the transfer of a ticket to a different agent.

## 4. Rules

| Topic | Rule |
|---|---|
| Available | A shift is a day and a time range that repeats each week. Example: Monday, 09:00 to 17:00. An agent is on shift when the current time is in a shift of the agent. Each agent has a timezone, so the shift times are in the local time of the agent. A shift can continue past midnight. |
| Too much work | Each agent has a ticket limit. The default is 5 open tickets. The service does not assign new tickets to an agent at the ticket limit. |
| Fair | The service assigns the ticket to the eligible agent with the fewest open tickets. If two agents have the same number, the service selects the agent who waited the longest time for a ticket. The service uses open tickets because open tickets show how much work each agent has now. |
| Coverage gap | Each company has one timezone. Coverage hours are the hours when the company must have an agent on shift, in that timezone. The default is all hours of all days. A coverage gap is one of these hours with no agent on shift. |
| Reason | The service records each decision. The record shows the selected agent, the rejected agents, and the reason for each. |

Example reason: "The service assigned ticket T-104 to Priya. Priya is on shift and has the fewest open tickets (2, with a limit of 5). Rejected: Sam (not on shift), Lee (at the ticket limit)."

## 5. Assumptions and simplifications

- The UI does not create companies or agents. The service starts with sample companies and agents.
- The service counts open tickets itself. The ticket system tells the service when a ticket is closed. A second small API does this. Before that moment, the ticket is open.
- If the ticket system sends the same `ticket_id` again, the API returns the same agent. The service counts the ticket one time only.
- If no agent is eligible, the API gives the reason: no agent on shift, or all agents at the ticket limit. The ticket system calls the API again later.
- A ticket stays with the assigned agent after the shift of the agent ends.
- Some countries move the clock by one hour two times each year (daylight saving time). The service keeps each shift in the local time of the agent, so a 09:00 shift stays at 09:00. The lead changes nothing.
