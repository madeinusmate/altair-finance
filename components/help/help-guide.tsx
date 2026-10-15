import Link from "next/link";

const sections = [
  { id: "start", title: "Start here" },
  { id: "words", title: "Words Netly uses" },
  { id: "books", title: "Books and the passphrase" },
  { id: "accounts", title: "Accounts" },
  { id: "transactions", title: "Transactions" },
  { id: "transfers", title: "Transfers" },
  { id: "categories", title: "Categories" },
  { id: "payees", title: "Payees" },
  { id: "rules", title: "Description rules" },
  { id: "budgets", title: "Budgets" },
  { id: "home", title: "Home" },
  { id: "currencies", title: "Currencies" },
  { id: "import", title: "Getting numbers in" },
  { id: "backups", title: "Backups and deletion" },
  { id: "agent", title: "The agent" },
  { id: "example", title: "A month on paper" },
] as const;

const Section = ({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) => (
  <section id={id} className="scroll-mt-6 space-y-4 border-t border-border pt-10">
    <h2 className="text-[22px] font-semibold tracking-[-0.02em]">{title}</h2>
    <div className="space-y-4 text-[15px] leading-7 text-foreground/90">{children}</div>
  </section>
);

const Term = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="grid gap-1 border-b border-border py-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-6">
    <dt className="font-medium text-foreground">{title}</dt>
    <dd>{children}</dd>
  </div>
);

export const HelpGuide = () => (
  <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 lg:flex-row lg:items-start">
    <nav aria-label="On this page" className="lg:sticky lg:top-0 lg:w-52 lg:shrink-0">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">On this page</p>
      <ol className="mt-3 columns-2 gap-x-4 space-y-1 lg:columns-1">
        {sections.map((section, index) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className="block rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <span className="mr-2 tabular-nums text-muted-foreground/70">{String(index + 1).padStart(2, "0")}</span>
              {section.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>

    <article className="min-w-0 flex-1">
      <header className="space-y-3">
        <h1 className="text-[34px] font-semibold leading-[40px] tracking-[-0.03em]">Help</h1>
        <p className="max-w-2xl text-[15px] leading-7 text-muted-foreground">
          Netly is a personal finance app whose books stay on this computer. This page is the model behind Home,
          Accounts, Transactions, and Budget: what each number is made of, and what to record so the picture stays true.
        </p>
      </header>

      <Section id="start" title="Start here">
        <ol className="list-decimal space-y-2 pl-5">
          <li>Choose a passphrase on first launch and keep a copy somewhere you control. Netly cannot recover it.</li>
          <li>
            Add every account that belongs in your net worth. Pick the type that matches how you know the balance.
          </li>
          <li>
            Put spending and income on transaction accounts. Move money between your own accounts with a transfer.
          </li>
          <li>Set a monthly amount on the spending categories you want to watch.</li>
          <li>Open Home and read net worth, savings rate, and cash flow against that record.</li>
        </ol>
        <p>
          The sidebar is the map: <Link className="underline underline-offset-4" href="/dashboard">Home</Link>,{" "}
          <Link className="underline underline-offset-4" href="/accounts">Accounts</Link>,{" "}
          <Link className="underline underline-offset-4" href="/transactions">Transactions</Link>,{" "}
          <Link className="underline underline-offset-4" href="/budget">Budget</Link>, and{" "}
          <Link className="underline underline-offset-4" href="/settings">Settings</Link>.
        </p>
      </Section>

      <Section id="words" title="Words Netly uses">
        <dl>
          <Term title="Books">
            The encrypted ledger on this Mac. Accounts, transactions, transfers, budgets, and settings all live in the books.
          </Term>
          <Term title="Passphrase">
            The secret you type to open the books. An agent grant can keep a keychain copy for the books owner. The agent never receives the passphrase.
          </Term>
          <Term title="Books owner">
            The one local process that holds the books open. The Netly window and the <span className="font-medium">netly</span> command both talk to it.
          </Term>
          <Term title="Agent grant">
            Permission for this macOS user to use the netly command. There is one grant. It starts the books owner at login and leaves the books open for that login session.
          </Term>
          <Term title="Intent confirm">
            A macOS dialog you answer before the books are deleted, an account is deleted, or the books are exported. The program that asked cannot answer it for you.
          </Term>
          <Term title="Home currency">
            The currency Home and Budget open in. Set it on your profile in Settings.
          </Term>
        </dl>
      </Section>

      <Section id="books" title="Books and the passphrase">
        <p>
          The first screen asks for your name and a passphrase of at least 8 characters. That passphrase encrypts the books. There is no Netly account, and there is no recovery email. If you lose the passphrase, the books stay closed.
        </p>
        <p>
          Each later launch opens on the unlock screen. A wrong passphrase and a file that cannot be opened look the same: the books stay locked. If a stored key cannot open the file, Netly shows a recovery screen. From there you return to unlock, or you restore a backup you exported earlier.
        </p>
        <p>
          Lock, in the sidebar, closes the books in this window. While an agent grant is running, Lock stays hidden because the books owner is holding them open for the login session. Quitting the window does not close the books in that case. Stop or revoke the grant in{" "}
          <Link className="underline underline-offset-4" href="/settings#agent">Settings → Agent</Link> when you want them closed.
        </p>
        <p className="rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm leading-6">
          Export a backup before you delete the books, replace them with an import, or experiment with a new passphrase. The export is an encrypted zip of the books you already have.
        </p>
      </Section>

      <Section id="accounts" title="Accounts">
        <p>
          An account is one balance you want in the picture: a bank account, a card, a loan, a brokerage, a property, cash in a drawer. You create it by hand under Accounts, or you import a list of them. Open banking is not part of this app.
        </p>
        <p>Every account has a name, a type, a nature, an account category, and a currency. The currency is fixed for that account. Amounts on it stay in that currency.</p>

        <h3 className="pt-2 text-base font-medium text-foreground">Type</h3>
        <p>The type is how the balance is known.</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <span className="font-medium text-foreground">Balance.</span> You write down the balance on a date. The current balance is the latest entry on or before today. With no entries yet, Netly uses the initial balance. Use this for a mortgage, a loan, a property, or cash you count occasionally.
          </li>
          <li>
            <span className="font-medium text-foreground">Transaction.</span> The balance is computed from a starting amount plus every debit, credit, and transfer. Use this for checking, savings you itemize, and credit cards.
          </li>
          <li>
            <span className="font-medium text-foreground">Investment.</span> Always an asset, and the initial balance is zero. Money arrives and leaves by transfer. You record market value on dates. Profit and loss is the latest market value minus net contributions.
          </li>
        </ul>
        <p>
          When two balance or value entries share a date, the one you saved later is the one in force.
        </p>

        <h3 className="pt-2 text-base font-medium text-foreground">Nature</h3>
        <p>
          An asset adds to net worth. A liability subtracts from it. A liability balance is the positive amount you owe: a card at 80 means you owe 80. Investment accounts are always assets.
        </p>

        <h3 className="pt-2 text-base font-medium text-foreground">How a transaction account moves</h3>
        <p>For an asset:</p>
        <p className="font-medium text-foreground">starting balance + credits − debits + transfers in − transfers out</p>
        <p>For a liability, the same events point the other way, because a charge increases what you owe:</p>
        <p className="font-medium text-foreground">starting balance + debits − credits + transfers out − transfers in</p>
        <p>
          A debit on a checking account lowers the balance. A debit on a credit card raises the amount owed. A credit is income or a refund on an asset, and a payment that reduces a liability when you record it on the card itself. Paying the card from checking is usually a transfer, described below.
        </p>

        <h3 className="pt-2 text-base font-medium text-foreground">Account categories</h3>
        <p>
          The account category says what the account is: Checking, Savings, Cash, Credit Card, Mortgage, Brokerage, and the other labels seeded with the books. You can add your own under{" "}
          <Link className="underline underline-offset-4" href="/settings/categories">Settings → Categories</Link>.
        </p>
        <p>
          Liquid cash, used for runway on Home, is an asset in Checking, Savings, or Cash, and it must be a transaction account or a balance account. A brokerage, a retirement account, and a credit card stay out of that cash pile.
        </p>
        <p>
          Deleting an account removes its transactions, transfers, balance entries, and investment values. macOS asks you to confirm before that happens.
        </p>
      </Section>

      <Section id="transactions" title="Transactions">
        <p>
          A transaction is one debit or one credit on a transaction account. Balance accounts and investment accounts do not take transactions. Record a balance or a market value on those, and move money with a transfer.
        </p>
        <p>Each transaction has:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <span className="font-medium text-foreground">Type.</span> Debit or credit. Debit categories are spending. Credit categories are income. The category list follows the type you pick.
          </li>
          <li>
            <span className="font-medium text-foreground">Amount.</span> Always a positive number, in the account&apos;s currency. The type says which way it moves the balance.
          </li>
          <li>
            <span className="font-medium text-foreground">Date.</span> The day the activity belongs to. Home, Budget, and the ledgers all filter on this date.
          </li>
          <li>
            <span className="font-medium text-foreground">Payee.</span> Who you paid, or who paid you. Optional. Matching names share one payee.
          </li>
          <li>
            <span className="font-medium text-foreground">Statement line.</span> The bank&apos;s original text. Optional. Saving a transaction that has one also stores a description rule for that line.
          </li>
        </ul>
        <p>
          Income on Home is the sum of credits on transaction accounts in the dates you selected. Expenses are the debits on those accounts. Transfers are left out of both.
        </p>
        <p>
          The Transactions page lists transactions and transfers together. Search matches the statement line, payee, category, and account. You can also filter by category, type, account, payee, and a date range: this month, last month, the last 3 or 12 months, all time, or dates you choose. Select several rows to move them onto one category. A category has to be legal for every selected row: a spending category can land on debits, an income category on credits.
        </p>
      </Section>

      <Section id="transfers" title="Transfers">
        <p>
          A transfer moves money between two of your accounts. It is one event with a from amount and a to amount. When both accounts use the same currency, those amounts match. When they differ, you enter each side and the rate you actually got.
        </p>
        <p>Transfers are how these everyday moves stay honest:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Paying a credit card from checking lowers checking and lowers what you owe. The expense was the earlier charge on the card.
          </li>
          <li>
            Moving checking into a savings account changes where the cash sits. It is still your cash.
          </li>
          <li>
            Moving cash into an investment account is a contribution. Moving it back is a withdrawal. Home treats that pair as investment flow, separate from income and spending.
          </li>
        </ul>
        <p>
          You need two accounts before the transfer button is available. The transfer category is its own kind of category, separate from spending and income.
        </p>
      </Section>

      <Section id="categories" title="Categories">
        <p>Netly has two category lists, and they answer different questions.</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <span className="font-medium text-foreground">Account categories</span> describe the account: Checking, Credit Card, Mortgage, Real Estate.
          </li>
          <li>
            <span className="font-medium text-foreground">Transaction categories</span> describe the activity. Debit categories start as Shopping, Food &amp; Drink, Rent &amp; Utilities, and the other spending labels. Credit categories start as Salary, Investment, Other Income, and Capital Gain Income. Transfer is the category used by transfers.
          </li>
        </ul>
        <p>
          A category keeps a stable identity. Renaming Food &amp; Drink to Groceries keeps the old transactions, the budget, and the description rules on that same category. Color and icon are display. They follow the category onto the ledger.
        </p>
        <p>
          Deleting a transaction category that still has transactions, transfers, or a budget asks you which category should take them. Deleting an account category that is still in use moves those accounts onto a default category.
        </p>
      </Section>

      <Section id="payees" title="Payees">
        <p>
          A payee is the other party on a transaction. Netly folds names that match after trimming, lowercasing, and collapsing spaces into one payee, so &quot;FairPrice&quot; and &quot;fairprice&quot; share an icon and a filter.
        </p>
        <p>
          Set the icon or image when you create the payee, or later under{" "}
          <Link className="underline underline-offset-4" href="/settings/payees">Settings → Payees</Link>.
          That screen is also where you rename a payee or merge two into one. Merging keeps the transactions and points them at the payee you keep.
        </p>
        <p>
          The statement line can stay as the bank wrote it. The payee is your name for the counterparty. A description rule matches the statement line, so the two fields have different jobs.
        </p>
      </Section>

      <Section id="rules" title="Description rules">
        <p>
          A description rule says: this statement line, for debits, credits, or both, belongs in this category. The match is exact after the line is trimmed, lowercased, and collapsed to single spaces.
        </p>
        <p>
          A rule is saved when you add or edit a transaction that has a statement line and a real category. Import review can learn the same way when you correct a category and confirm the file. Manage the list under Settings → Categories. A rule whose category no longer fits its type is marked broken.
        </p>
        <p>
          On the next import, a matching line is categorized for you. A line with no rule keeps a fallback category and a warning, so you can set it in the review step before anything is saved.
        </p>
      </Section>

      <Section id="budgets" title="Budgets">
        <p>
          A budget is a monthly amount for one debit category, in one currency. Spending against it is the debits in that category during the month, converted into the currency you are viewing. Credits and transfers do not count as spending.
        </p>
        <p>
          You set the amount on the month you care about. A later month with no amount of its own carries forward the latest earlier amount for that category. The row says which month it came from. Changing this month writes an amount for this month and leaves the earlier one in place.
        </p>
        <p>
          For the current month, pace compares spending so far with a straight line through the month. On track means you have used no more than that share of the budget. Ahead means spending is running faster than the calendar. Pace is hidden on past and future months. Those months show the amount and what was spent.
        </p>
        <p>
          Categories with spending and no budget appear as unbudgeted. The summary adds that spending beside the budgeted total so the month still includes it.
        </p>
        <p>
          Home shows the current month&apos;s budget for the currency selected there. The Budget page lets you move month by month and switch among the currencies you have enabled.
        </p>
      </Section>

      <Section id="home" title="Home">
        <p>
          Home is the household view in one currency. The currency switch uses your enabled currencies, and it opens on your home currency. The date control defaults to the last 3 months, including the current one. You can choose the current month, the last 6 or 12 months, all time, or a custom range.
        </p>
        <p>
          That range applies to cash flow, savings rate, income and expenses, spending, and the history charts. The net worth total and the runway figure use the books as they stand now.
        </p>

        <h3 className="pt-2 text-base font-medium text-foreground">Net worth</h3>
        <p>
          Net worth is assets minus liabilities, after each account is converted into the currency on screen. Each converted balance is rounded first — to the cent, or to a whole unit once the absolute value reaches one million — and then the rounded balances are added. The card also splits the same total into assets and liabilities.
        </p>
        <p>
          Every account needs a supported currency before the total is shown. An unsupported currency hides the total and names the currencies to fix under Accounts.
        </p>
        <p>
          The history chart walks the selected months and uses the balance in force at each month: the computed transaction balance, or the latest balance or market value dated on or before that month.
        </p>

        <h3 className="pt-2 text-base font-medium text-foreground">Savings rate</h3>
        <p>
          Savings rate is kept divided by income, for the dates on screen. Kept is income minus expenses. Income and expenses come only from transaction accounts. With no income in the range, Home says so and leaves the rate blank.
        </p>
        <p>
          Money you sent into investments during the range is shown beside the rate as the signed investment flow. What stayed in cash is kept minus that flow.
        </p>

        <h3 className="pt-2 text-base font-medium text-foreground">Runway</h3>
        <p>
          Runway is months of expenses sitting in liquid cash: liquid balance divided by typical monthly expenses. Typical expenses are the average of up to the last three complete months before this one. The selected dates on Home do not change that average. With no complete month of expenses yet, runway stays blank.
        </p>

        <h3 className="pt-2 text-base font-medium text-foreground">Investment profit and loss</h3>
        <p>
          Investment P/L is market value minus net contributions, summed across investment accounts and converted into the currency on screen. A contribution is a transfer in. A withdrawal is a transfer out. The gain is what the market value did beyond the cash you moved.
        </p>

        <h3 className="pt-2 text-base font-medium text-foreground">Cash flow</h3>
        <p>
          The cash flow chart takes income for the selected dates and shows where it went: into investments, out as expenses, and what remained. The savings node on that chart is income minus expenses minus the cash sent into investments. It is a picture of the period. The savings rate above it is kept divided by income.
        </p>

        <h3 className="pt-2 text-base font-medium text-foreground">The other charts</h3>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <span className="font-medium text-foreground">Net worth over time</span> is the month-end household total.
          </li>
          <li>
            <span className="font-medium text-foreground">Income and expenses</span> are monthly credits and debits on transaction accounts.
          </li>
          <li>
            <span className="font-medium text-foreground">Net cash</span> is income minus expenses for each of those months.
          </li>
          <li>
            <span className="font-medium text-foreground">Spending</span> groups debits by category and compares them with the previous window of the same length, and with the same dates a year earlier when that history exists. A move smaller than half a cent is treated as flat.
          </li>
          <li>
            <span className="font-medium text-foreground">Investment performance</span> plots market value, contributions, and profit and loss. You can look at every investment account or one of them.
          </li>
        </ul>
        <p>Recent activity lists the latest transactions and transfers, with the account they touched.</p>
      </Section>

      <Section id="currencies" title="Currencies">
        <p>
          Accounts can use Hong Kong dollar, US dollar, Singapore dollar, euro, or British pound. Totals on Home and Budget are converted into the currency you are viewing. The rate table is based on the US dollar and is fetched from open.er-api.com when the saved rates are older than a day. If that fetch fails, Netly keeps using the last rates it saved.
        </p>
        <p>
          A transfer across currencies stores the amount that left, the amount that arrived, and the rate on that transfer. Reports use the latest rate table, so a historical total can move slightly when rates update.
        </p>
        <p>
          Settings → Currencies chooses which currencies appear as switches on Home and Budget. Your home currency stays available. New accounts default to Singapore dollar until you pick another.
        </p>
      </Section>

      <Section id="import" title="Getting numbers in">
        <p>
          You can type every row, or you can import. Nothing is pulled from a bank. The import wizard is under{" "}
          <Link className="underline underline-offset-4" href="/settings/import">Settings → Data Import</Link>.
        </p>
        <h3 className="pt-2 text-base font-medium text-foreground">CSV</h3>
        <p>Three file shapes, each with a template on the upload step:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <span className="font-medium text-foreground">Transactions + Transfers.</span> Activity rows, including moves between accounts.
          </li>
          <li>
            <span className="font-medium text-foreground">Balances + Investments.</span> Dated balances for balance accounts, and dated market values for investment accounts.
          </li>
          <li>
            <span className="font-medium text-foreground">Accounts.</span> A list of accounts so you can set the books up quickly.
          </li>
        </ul>
        <p>
          You review every row before it is saved. Invalid rows stay out. Duplicate rows are ones already in the books — the same account, date, amount, and description fingerprint — and they are skipped so importing a file twice does not double the ledger.
        </p>
        <h3 className="pt-2 text-base font-medium text-foreground">PDF statements</h3>
        <p>
          A PDF statement imports into one transaction account. By default the file is read on this computer. Cloud parsing is a separate switch: it sends that PDF to OpenAI, and it works only if you have set your own API key. You still review the rows, and the same duplicate check applies.
        </p>
        <h3 className="pt-2 text-base font-medium text-foreground">Import history</h3>
        <p>
          <Link className="underline underline-offset-4" href="/settings/imports">Import history</Link> lists the files you have brought in. Deleting one removes the transactions, transfers, balances, or investment values that arrived with that file.
        </p>
      </Section>

      <Section id="backups" title="Backups and deletion">
        <p>
          Settings can export the books as an encrypted zip, or import a zip you exported earlier. Import replaces the books on this Mac with the file you chose. Export the current books first if you might want them back.
        </p>
        <p>
          Exporting the books, deleting an account, and deleting the books each raise a macOS dialog. Cancel leaves the books untouched. Leaving the dialog unanswered cancels the action too.
        </p>
        <p>
          Deleting the books removes the local ledger and starts you over with a new passphrase. That is the danger zone in Settings. It is permanent.
        </p>
      </Section>

      <Section id="agent" title="The agent">
        <p>
          An agent grant lets the <span className="font-medium">netly</span> command read and change the books while you are logged in, including when the Netly window is closed. Any program you run on this Mac can use that command. The passphrase stays in the macOS keychain for the books owner. The command never receives it.
        </p>
        <p>
          The sidebar shows Agent as connected while the books owner is running, and disconnected when the grant is stopped or missing. The status opens{" "}
          <Link className="underline underline-offset-4" href="/settings#agent">Settings → Agent</Link>, where you create the grant, copy a prompt for an assistant on this Mac, stop the owner, or revoke the grant.
        </p>
        <p>
          <span className="font-medium">netly help</span> prints the command list: accounts, transactions, transfers, budgets, categories, imports, dashboard figures, balance history, and export. Destructive commands still wait on the macOS dialog.
        </p>
      </Section>

      <Section id="example" title="A month on paper">
        <p>
          Four accounts, all in one currency so the arithmetic stays visible. Checking is a transaction asset starting at 0. The card is a transaction liability starting at 0. The brokerage is an investment account. The mortgage is a balance liability.
        </p>
        <ol className="list-decimal space-y-3 pl-5">
          <li>
            A salary credit of 5,000 lands on checking, category Salary. Checking is 5,000. That 5,000 is income.
          </li>
          <li>
            Groceries are a debit of 80 on the card, category Food &amp; Drink, payee the store, statement line whatever the bank printed. You owe 80. That 80 is an expense. The statement line becomes a description rule, so the next identical line arrives already categorized.
          </li>
          <li>
            A transfer of 80 from checking to the card pays the bill. Checking is 4,920. The card is back to 0. Income and expenses are unchanged, because the expense was the charge.
          </li>
          <li>
            A transfer of 1,000 from checking to the brokerage is a contribution. Checking is 3,920. Net contributions on the brokerage are 1,000.
          </li>
          <li>
            You record the brokerage market value at 1,040. Profit and loss is 40. Net worth includes 1,040, which is the market value.
          </li>
          <li>
            You record the mortgage balance at 200,000. That is a liability. It does not create an expense. Interest, if you want it in spending, is its own debit.
          </li>
        </ol>
        <p>Read in the same currency, the month looks like this:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Assets are checking 3,920 plus the brokerage at 1,040, so 4,960.</li>
          <li>Liabilities are the mortgage at 200,000. The card is paid off.</li>
          <li>Net worth is 4,960 − 200,000.</li>
          <li>Income is 5,000. Expenses are 80. Kept is 4,920. The savings rate is 4,920 / 5,000, or 98.4%.</li>
          <li>Signed investment is the 1,000 contribution. Cash left after that is 3,920, which matches checking.</li>
          <li>Liquid cash for runway is the checking balance, if checking is in the Checking category. The brokerage and the mortgage stay out of it.</li>
          <li>A Food &amp; Drink budget of 400 shows 80 spent. Early in the month that is on track.</li>
        </ul>
        <p>
          Change one recording choice and the picture changes with it. Enter the groceries on checking instead of the card, and the card never rises. Enter the card payment as a second expense, and spending is counted twice. Enter the brokerage contribution as income on the brokerage, and Home treats savings as income. The transfer is the move that keeps a single story.
        </p>
      </Section>
    </article>
  </div>
);
