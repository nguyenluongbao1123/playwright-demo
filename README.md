# playwright-demo
# Git Workflow Guide

## Process for Pushing Code from Local → Feature Branch → Pull Request → Prod

---

# 1. Workflow Overview

Standard Git workflow:

```text
Pull latest code from the main branch
        ↓
Create a feature branch for the task
        ↓
Code / update source
        ↓
Add + Commit code
        ↓
Push branch to remote
        ↓
Create Pull Request (PR)
        ↓
Code Review
        ↓
Merge into Prod/Main
```

---

# 2. Pull Latest Source Code

Before starting a new task, always pull the latest code from the main branch.

## Pull from prod branch

```bash
git checkout prod
```

```bash
git pull origin prod
```

Or if the project uses main:

```bash
git checkout main
```

```bash
git pull origin main
```

---

# 3. Create a Separate Branch for the Task

Recommended naming convention:

| Type       | Example                     |
| ---------- | --------------------------- |
| Feature    | feature/login-api           |
| Bug Fix    | bugfix/fix-timeout          |
| Hotfix     | hotfix/payment-error        |
| Automation | automation/playwright-login |

## Create a new branch

```bash
git checkout -b feature/playwright-login
```

Check the current branch:

```bash
git branch
```

The active branch will have a `*` symbol.

---

# 4. Coding & Source Updates

Tasks may include:

* Updating source code
* Adding automation tests
* Updating APIs
* Fixing bugs
* Updating configurations

---

# 5. Check Modified Files

```bash
git status
```

Example:

```text
modified: tests/login.spec.ts
modified: package.json
```

---

# 6. Add Files to Git

## Add all files

```bash
git add .
```

## Add a specific file

```bash
git add tests/login.spec.ts
```

---

# 7. Commit Code

## Best Practice

Commit messages should be:

* Short
* Clear
* Meaningful

## Example commit messages

```bash
git commit -m "add playwright login automation"
```

```bash
git commit -m "fix timeout issue in login api"
```

```bash
git commit -m "update edi mapping validation"
```

---

# 8. Push Branch to Remote

## First push

```bash
git push -u origin feature/playwright-login
```

## Future pushes

```bash
git push
```

---

# 9. Pull Latest Code Before Creating a PR

Before creating a PR, sync your branch with prod/main.

## If using prod

```bash
git checkout prod
```

```bash
git pull origin prod
```

Switch back to the feature branch:

```bash
git checkout feature/playwright-login
```

Merge the latest prod branch:

```bash
git merge prod
```

---

# 10. Resolve Conflicts (If Any)

If a conflict occurs:

```text
CONFLICT (content): Merge conflict in file.ts
```

## How to resolve

1. Open the conflicted file
2. Fix the content
3. Remove markers:

```text
<<<<<<< HEAD
=======
>>>>>>> branch-name
```

Then run:

```bash
git add .
```

```bash
git commit -m "resolve merge conflict"
```

---

# 11. Create a Pull Request (PR)

After successfully pushing the branch:

## Step 1

Go to the GitHub repository.

## Step 2

Select:

```text
Compare & pull request
```

## Step 3

Verify:

| Field          | Example                  |
| -------------- | ------------------------ |
| Base branch    | prod                     |
| Compare branch | feature/playwright-login |

---

# 12. Write Pull Request Content

## PR Title Example

```text
Add playwright login automation test
```

## PR Description Example

```text
- Add login automation script
- Add reusable login helper
- Update environment config
- Validate login success flow
```

---

# 13. Code Review Process

Reviewers will:

* Review source code
* Review automation scripts
* Verify coding standards
* Verify test results
* Approve the PR

If changes are required:

* Update the source
* Commit again
* Push the branch again

```bash
git add .
```

```bash
git commit -m "update based on review comments"
```

```bash
git push
```

The PR will update automatically.

---

# 14. Merge PR into Prod

After the PR is approved:

Select:

```text
Merge Pull Request
```

Or:

```text
Squash and Merge
```

---

# 15. Pull Latest Code After Merge

After a successful merge:

```bash
git checkout prod
```

```bash
git pull origin prod
```

---

# 16. Delete Branch After Merge

## Delete local branch

```bash
git branch -d feature/playwright-login
```

## Delete remote branch

```bash
git push origin --delete feature/playwright-login
```

---

# 17. Full Workflow Example

## Complete Flow

```bash
# pull latest code

git checkout prod
git pull origin prod

# create feature branch

git checkout -b feature/playwright-login

# coding...

# add source

git add .

# commit

git commit -m "add playwright login automation"

# push branch

git push -u origin feature/playwright-login

# create PR on GitHub

# after PR approved and merged

git checkout prod
git pull origin prod

# delete feature branch

git branch -d feature/playwright-login
```

---

# 18. Best Practices

## Recommended

* Pull the latest code daily
* One task = one separate branch
* Use clear commit messages
* Do not code directly on prod/main
* Resolve conflicts early
* Review code before merging

---

# 19. Common Errors

## Error: rejected fetch first

Fix:

```bash
git pull origin prod
```

---

## Error: couldn't find remote ref master

The repository is using:

```text
main or prod
```

Not:

```text
master
```

---

## Error: merge conflict

Fix:

* Resolve the conflict files
* git add .
* git commit

---

# 20. Git Commands Summary

| Command         | Purpose             |
| --------------- | ------------------- |
| git pull        | Pull latest code    |
| git checkout -b | Create new branch   |
| git status      | Check changed files |
| git add .       | Add all files       |
| git commit -m   | Commit code         |
| git push        | Push code           |
| git merge       | Merge branch        |
| git branch -d   | Delete branch       |

---

# 21. Recommended Branch Strategy

| Branch    | Purpose                 |
| --------- | ----------------------- |
| prod      | Stable production code  |
| main      | Main development branch |
| develop   | Development integration |
| feature/* | New features            |
| bugfix/*  | Bug fixes               |
| hotfix/*  | Emergency fixes         |

---

# 22. Final Notes

* Do not push directly to prod if your team uses a review workflow.
* Always create PRs to track changes.
* Carefully review conflicts before merging.
* Keep branches clean and follow naming conventions.
* Avoid force push when working in a team.

